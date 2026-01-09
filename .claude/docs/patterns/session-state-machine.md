# Session State Machine Pattern

**Category**: State Management
**Confidence**: High
**Location**: `backend/src/services/SessionManager.ts`

---

## Overview

The Session State Machine pattern manages the lifecycle of streaming sessions through well-defined states and transitions. It ensures consistent behavior and proper resource management throughout a session's lifetime.

---

## State Diagram

```
         ┌──────────────┐
    ┌───>│ INITIALIZING │
    │    └──────┬───────┘
    │           │ (ffmpeg spawned + 2s delay)
    │           v
    │    ┌──────────────┐
    │    │    READY     │
    │    └──────┬───────┘
    │           │ (client accesses stream)
    │           v
    │    ┌──────────────┐
    │    │    ACTIVE    │
    │    └──────┬───────┘
    │           │ (idle timeout)
    │           v
    │    ┌──────────────┐
    │    │     IDLE     │
    │    └──────┬───────┘
    │           │
    │           v
    │    ┌──────────────┐
    └────│  TERMINATED  │
         └──────────────┘
```

**Alternative Paths**:
- INITIALIZING → TERMINATED (ffmpeg spawn failure)
- ACTIVE → TERMINATED (explicit DELETE request)
- IDLE → TERMINATED (cleanup triggered)

---

## States

### INITIALIZING
**Purpose**: Initial state when session is created

**Characteristics**:
- Session exists in registry
- ffmpeg process spawning
- No HLS content available yet
- Cannot be accessed by clients

**Entry Conditions**:
- `POST /api/sessions` called successfully
- Audio file validated

**Exit Conditions**:
- ffmpeg started successfully + 2-second delay → **READY**
- ffmpeg spawn failure → **TERMINATED**

**Duration**: Typically 2-3 seconds

---

### READY
**Purpose**: Session ready for streaming, waiting for first client access

**Characteristics**:
- ffmpeg running and generating segments
- HLS content available in BufferStore
- Idle timeout active
- Can be accessed by clients

**Entry Conditions**:
- From INITIALIZING after 2-second delay
- ffmpeg successfully generating segments

**Exit Conditions**:
- Client accesses stream → **ACTIVE**
- Idle timeout expires → **TERMINATED**
- Explicit deletion → **TERMINATED**

**Duration**: Until first client access or timeout

---

### ACTIVE
**Purpose**: Client actively streaming content

**Characteristics**:
- ffmpeg running
- Client regularly fetching segments
- Last accessed timestamp updated on each request
- Idle timeout reset on each access

**Entry Conditions**:
- Client accesses stream (playlist or segment)
- `updateLastAccessed()` called

**Exit Conditions**:
- No client access for idle timeout period → **IDLE**
- Explicit deletion → **TERMINATED**
- ffmpeg error → **TERMINATED**

**Duration**: While client actively streaming

---

### IDLE
**Purpose**: Temporary state before cleanup

**Characteristics**:
- No recent client activity
- ffmpeg still running
- Scheduled for termination
- Can transition back to ACTIVE if accessed

**Entry Conditions**:
- No client access for `SESSION_IDLE_TIMEOUT` ms (default: 5 minutes)

**Exit Conditions**:
- Client access → **ACTIVE** (session reactivated)
- Cleanup triggered → **TERMINATED**

**Duration**: Brief transition state (seconds)

**Note**: In current implementation, IDLE immediately transitions to TERMINATED. This state exists for potential future enhancements (e.g., pause ffmpeg instead of terminating).

---

### TERMINATED
**Purpose**: Final state, session cleaned up

**Characteristics**:
- ffmpeg process killed
- Buffers cleared from BufferStore
- Session removed from registry
- Cannot be accessed by clients

**Entry Conditions**:
- Idle timeout expires
- Explicit DELETE request
- ffmpeg error
- Server shutdown

**Exit Conditions**:
- None (terminal state)

**Duration**: Permanent (until session removed)

---

## Transitions

### State Change Triggers

1. **Time-Based**:
   - 2-second delay: INITIALIZING → READY
   - Idle timeout: ACTIVE → IDLE → TERMINATED

2. **Event-Based**:
   - Client access: READY/IDLE → ACTIVE
   - ffmpeg exit: * → TERMINATED
   - DELETE request: * → TERMINATED

3. **Error-Based**:
   - ffmpeg spawn failure: INITIALIZING → TERMINATED
   - ffmpeg crash: * → TERMINATED

### Transition Implementation

```typescript
// INITIALIZING → READY
setTimeout(() => {
  if (session.state === SESSION_STATES.INITIALIZING) {
    session.state = SESSION_STATES.READY;
    logger.info({ sessionId }, 'Session ready for streaming');
  }
}, 2000);

// READY/IDLE → ACTIVE
if (session.state === SESSION_STATES.IDLE) {
  session.state = SESSION_STATES.ACTIVE;
  logger.debug({ sessionId }, 'Session reactivated from idle');
}

// ACTIVE → IDLE → TERMINATED
if (timeSinceLastAccess >= config.SESSION_IDLE_TIMEOUT) {
  logger.info({ sessionId, timeSinceLastAccess }, 'Session idle timeout');
  session.state = SESSION_STATES.IDLE;
  this.terminateSession(sessionId);
}
```

---

## Idle Timeout Mechanism

### Timer Management

Each session has an idle timeout timer:

```typescript
interface Session {
  // ... other fields
  lastAccessedAt: Date;
  idleTimeoutHandle: NodeJS.Timeout | null;
}
```

### Timer Reset

```typescript
updateLastAccessed(sessionId: string): void {
  const session = this.getSession(sessionId);
  if (!session) return;

  // Update timestamp
  session.lastAccessedAt = new Date();

  // Reactivate from IDLE
  if (session.state === SESSION_STATES.IDLE) {
    session.state = SESSION_STATES.ACTIVE;
  }

  // Reset idle timer
  this.resetIdleTimer(sessionId);
}
```

### Background Cleanup

Background interval checks for expired sessions:

```typescript
// Run every 1 minute (default)
setInterval(() => {
  const now = Date.now();

  for (const [sessionId, session] of sessions) {
    const timeSinceLastAccess = now - session.lastAccessedAt.getTime();

    if (timeSinceLastAccess >= config.SESSION_IDLE_TIMEOUT) {
      this.terminateSession(sessionId);
    }
  }
}, config.SESSION_CLEANUP_INTERVAL);
```

---

## Configuration

### Timeouts

| Setting | Environment Variable | Default | Purpose |
|---------|---------------------|---------|---------|
| Idle Timeout | SESSION_IDLE_TIMEOUT_MS | 300000 (5 min) | Max inactivity before cleanup |
| Cleanup Interval | SESSION_CLEANUP_INTERVAL_MS | 60000 (1 min) | Background check frequency |
| Ready Delay | N/A (hardcoded) | 2000 (2 sec) | Wait for ffmpeg to start |

### Tuning Recommendations

**Low Memory Environments**:
- Reduce idle timeout to 2-3 minutes
- Increase cleanup frequency to 30 seconds

**High Traffic**:
- Increase idle timeout to 10-15 minutes
- Reduce cleanup frequency to 2-5 minutes

**Development**:
- Increase idle timeout to 30+ minutes for easier debugging

---

## Benefits

### Resource Management
- Automatic cleanup of idle sessions
- Prevents resource leaks (ffmpeg processes, memory)
- Graceful handling of client disconnections

### Consistency
- Clear state definitions prevent invalid operations
- State transitions are predictable and logged
- Easy to reason about session lifecycle

### Debugging
- State logged on every transition
- Timestamps tracked for analysis
- Clear error paths

---

## Error Handling

### ffmpeg Spawn Failure
```typescript
try {
  const ffmpegProcess = await ffmpegManager.spawn({ ... });
} catch (error) {
  logger.error({ sessionId, error }, 'Failed to start ffmpeg');
  session.state = SESSION_STATES.TERMINATED;
  this.terminateSession(sessionId);
  throw error;
}
```

### ffmpeg Process Crash
```typescript
ffmpegProcess.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    logger.error({ sessionId, exitCode: code }, 'ffmpeg exited with error');
    this.terminateSession(sessionId);
  }
});
```

### Client Access During Termination
```typescript
// Stream routes check session state
if (!session || session.state === SESSION_STATES.TERMINATED) {
  return res.status(HTTP_STATUS.NOT_FOUND).json({
    error: 'Session not found'
  });
}

if (session.state === SESSION_STATES.INITIALIZING) {
  return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
    error: 'Session not ready'
  });
}
```

---

## Usage Examples

### Creating Session
```typescript
// Client creates session
const response = await fetch('/api/sessions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ audioFileId: 'audio-001' }),
});

const { sessionId, status } = await response.json();
console.log(status); // "INITIALIZING"

// Wait 2-3 seconds
await new Promise(r => setTimeout(r, 3000));

// Session now READY
```

### Streaming (Keeps Session Active)
```typescript
// Client fetches master playlist (updates lastAccessedAt)
fetch(`/stream/${sessionId}/master.m3u8`);

// Client fetches segments (updates lastAccessedAt each time)
fetch(`/stream/${sessionId}/128k/segment-000.ts`);
fetch(`/stream/${sessionId}/128k/segment-001.ts`);
// ... session stays ACTIVE
```

### Idle Cleanup
```typescript
// Client stops streaming
// After 5 minutes of no requests...
// → Session transitions ACTIVE → IDLE → TERMINATED
// → ffmpeg killed, buffers cleared
```

### Explicit Cleanup
```typescript
// Client explicitly deletes session
await fetch(`/api/sessions/${sessionId}`, {
  method: 'DELETE',
  headers: { 'Authorization': `Bearer ${token}` },
});
// → Session immediately transitions to TERMINATED
```

---

## Testing

### State Transition Tests
```typescript
describe('Session State Machine', () => {
  it('transitions from INITIALIZING to READY', async () => {
    const sessionId = await sessionManager.createSession('audio-001');
    const session = sessionManager.getSession(sessionId);

    expect(session.state).toBe(SESSION_STATES.INITIALIZING);

    await new Promise(r => setTimeout(r, 2500));

    expect(session.state).toBe(SESSION_STATES.READY);
  });

  it('transitions from IDLE to ACTIVE on access', () => {
    const session = sessionManager.getSession(sessionId);
    session.state = SESSION_STATES.IDLE;

    sessionManager.updateLastAccessed(sessionId);

    expect(session.state).toBe(SESSION_STATES.ACTIVE);
  });

  it('terminates after idle timeout', async () => {
    const sessionId = await sessionManager.createSession('audio-001');

    // Wait for idle timeout
    await new Promise(r => setTimeout(r, config.SESSION_IDLE_TIMEOUT + 1000));

    const session = sessionManager.getSession(sessionId);
    expect(session).toBeUndefined(); // Removed from registry
  });
});
```

---

## Future Enhancements

- [ ] Add PAUSED state (pause ffmpeg instead of terminating on idle)
- [ ] Add BUFFERING state (ffmpeg not generating segments fast enough)
- [ ] Add state persistence (Redis) for multi-instance deployments
- [ ] Add state change webhooks for client notifications
- [ ] Add metrics collection per state (time spent in each state)

---

## Related Files

- `backend/src/services/SessionManager.ts` - State machine implementation
- `backend/src/models/Session.ts` - State type definitions
- `backend/src/config/constants.ts` - State constants
- `backend/src/routes/stream.ts` - State checks on access

---

**References**:
- [SessionManager Implementation](../../backend/src/services/SessionManager.ts)
- [Session Model](../../backend/src/models/Session.ts)
