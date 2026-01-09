# Services Domain

**Path**: `backend/src/services/`
**Purpose**: Core business logic and orchestration layer
**Confidence**: High

---

## Overview

The Services domain contains the core business logic for Straimer. It orchestrates session lifecycle management, ffmpeg process handling, in-memory buffer storage, and audio library management. Services follow dependency injection patterns for testability.

---

## Files

### `SessionManager.ts`
**Purpose**: Session lifecycle management and orchestration

**Responsibilities**:
- Create and track streaming sessions
- Manage session state transitions
- Coordinate between FfmpegManager, BufferStore, and AudioLibrary
- Handle idle timeouts and cleanup
- Provide session statistics

**Key Methods**:

```typescript
// Initialize service and load audio library
async initialize(): Promise<void>

// Create new session for audio file
async createSession(audioFileId: string, qualities?: string[]): Promise<string>

// Get session by ID
getSession(sessionId: string): Session | undefined

// Get public session info
getSessionInfo(sessionId: string): SessionInfo | undefined

// Get all sessions
getAllSessions(): SessionInfo[]

// Update last accessed timestamp (resets idle timer)
updateLastAccessed(sessionId: string): void

// Terminate session and cleanup resources
async terminateSession(sessionId: string): Promise<void>

// Shutdown service (terminate all sessions)
async shutdown(): Promise<void>

// Get statistics
getStats(): {
  sessionCount: number;
  activeCount: number;
  idleCount: number;
  bufferStats: { sessionCount: number; totalFiles: number; totalBytes: number };
}
```

**Session State Machine**:
```
INITIALIZING → READY → ACTIVE → IDLE → TERMINATED
     ↓                              ↓
     └──────────→ TERMINATED ←──────┘
```

**State Transitions**:
- **INITIALIZING**: Session created, ffmpeg spawning
- **READY**: ffmpeg started, waiting for first access (after 2s delay)
- **ACTIVE**: Client actively streaming content
- **IDLE**: No access for timeout period
- **TERMINATED**: Cleanup complete, resources freed

**Idle Management**:
- Each session has idle timeout timer (default: 5 minutes)
- Timer resets on every stream access via `updateLastAccessed()`
- Background cleanup interval checks for expired sessions (default: 1 minute)
- Idle sessions transition to TERMINATED and get cleaned up

**Dependencies**:
- `BufferStore` - In-memory HLS content storage
- `AudioLibrary` - Audio file discovery and validation
- `FfmpegManager` - Process spawning and management

**Location**: `/Users/ianandrewson/coding/projects/straimer/backend/src/services/SessionManager.ts`

---

### `FfmpegManager.ts`
**Purpose**: ffmpeg process spawning and management

**Responsibilities**:
- Spawn ffmpeg processes with multi-bitrate output
- Build ffmpeg command-line arguments
- Monitor ffmpeg output (stdout/stderr)
- Set up file watchers for HLS output
- Capture generated segments to BufferStore
- Handle process termination and cleanup

**Key Methods**:

```typescript
// Spawn ffmpeg process for session
async spawn(options: FfmpegOptions): Promise<ChildProcess>

// Kill ffmpeg process gracefully
async killProcess(sessionId: string, process: ChildProcess): Promise<void>
```

**FfmpegOptions**:
```typescript
interface FfmpegOptions {
  sessionId: string;        // Session identifier
  audioFilePath: string;    // Input audio file path
  qualities: string[];      // Quality labels (e.g., ['64k', '128k', '256k'])
  bitrates: number[];       // Bitrates in kbps (e.g., [64, 128, 256])
}
```

**ffmpeg Command Structure**:
```bash
ffmpeg -i <input>
  -preset ultrafast -threads 2
  # Output 1 (64k)
  -map 0:a -c:a aac -b:a 64k -ac 2 -ar 44100
  -f hls -hls_time 10 -hls_list_size 0 -hls_segment_filename <tempDir>/64k/segment-%03d.ts
  <tempDir>/64k/playlist.m3u8
  # Output 2 (128k)
  -map 0:a -c:a aac -b:a 128k -ac 2 -ar 44100
  -f hls -hls_time 10 -hls_list_size 0 -hls_segment_filename <tempDir>/128k/segment-%03d.ts
  <tempDir>/128k/playlist.m3u8
  # Output 3 (256k)
  -map 0:a -c:a aac -b:a 256k -ac 2 -ar 44100
  -f hls -hls_time 10 -hls_list_size 0 -hls_segment_filename <tempDir>/256k/segment-%03d.ts
  <tempDir>/256k/playlist.m3u8
```

**File Watching Strategy**:
- Creates temporary directory: `/tmp/straimer-<sessionId>/`
- Watches each quality subdirectory (e.g., `64k/`, `128k/`, `256k/`)
- On file creation/change: reads file and stores in BufferStore
- On process exit: cleans up temporary directory and watchers

**Memory-Only Streaming**:
- ffmpeg outputs to temporary disk location
- File watchers capture output and store in memory (BufferStore)
- Temporary files deleted after capture
- No permanent disk storage (minimizes SD card wear on Raspberry Pi)

**Performance Tuning**:
- Preset: `ultrafast` (fastest encoding, lower compression)
- Threads: 2 (balance between speed and CPU usage)
- HLS segment duration: 10 seconds (configurable via `config.HLS_SEGMENT_DURATION`)

**Location**: `/Users/ianandrewson/coding/projects/straimer/backend/src/services/FfmpegManager.ts`

---

### `BufferStore.ts`
**Purpose**: In-memory storage for HLS content (playlists and segments)

**Responsibilities**:
- Store HLS playlists and segments in memory
- Organize content by session and filename
- Generate HLS master playlists
- Track memory usage per session
- Clear buffers on session termination

**Data Structure**:
```typescript
Map<sessionId, Map<filename, Buffer>>
```

**Key Methods**:

```typescript
// Store buffer for session
set(sessionId: string, filename: string, data: Buffer): void

// Retrieve buffer
get(sessionId: string, filename: string): Buffer | undefined

// Check if session or file exists
has(sessionId: string, filename?: string): boolean

// Clear session buffers
clear(sessionId: string): void

// Clear all buffers
clearAll(): void

// Get list of files for session
getSessionFiles(sessionId: string): string[]

// Generate and store master playlist
generateMasterPlaylist(sessionId: string, qualities: string[], bitrates: number[]): string

// Get memory usage (in bytes)
getMemoryUsage(sessionId?: string): number

// Get statistics
getStats(): {
  sessionCount: number;
  totalFiles: number;
  totalBytes: number;
}
```

**File Naming Convention**:
- Master playlist: `master.m3u8`
- Variant playlists: `<quality>/playlist.m3u8` (e.g., `64k/playlist.m3u8`)
- Segments: `<quality>/segment-<number>.ts` (e.g., `64k/segment-000.ts`)

**Master Playlist Generation**:
```m3u8
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=64000,CODECS="mp4a.40.2"
64k/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=128000,CODECS="mp4a.40.2"
128k/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=256000,CODECS="mp4a.40.2"
256k/playlist.m3u8
```

**Memory Management**:
- Buffers stored in Node.js heap
- No manual garbage collection (Node.js handles this)
- Memory usage tracked and reported via `getStats()`
- Cleared automatically on session termination
- Monitor via `/health` endpoint

**Performance Considerations**:
- Target: 50-100MB per active session
- 10-second segments at 256kbps: ~320KB per segment
- Typical session: 10-20 segments = 3-6MB
- 10 concurrent sessions: 30-60MB (within target)

**Location**: `/Users/ianandrewson/coding/projects/straimer/backend/src/services/BufferStore.ts`

---

### `AudioLibrary.ts`
**Purpose**: Audio file discovery, loading, and validation

**Responsibilities**:
- Load audio library from JSON file
- Index files by ID for O(1) lookup
- Validate file existence on filesystem
- Provide file listing and search

**Key Methods**:

```typescript
// Load library from JSON file
async load(): Promise<void>

// Get all audio files
getAll(): AudioFile[]

// Get audio file by ID
getById(id: string): AudioFile | undefined

// Validate file exists on filesystem
async validate(id: string): Promise<boolean>

// Get library statistics
getStats(): {
  totalFiles: number;
  totalSize: number;
  formats: Map<string, number>;
}
```

**Library JSON Structure**:
```json
{
  "version": "1.0",
  "files": [
    {
      "id": "audio-001",
      "title": "Track Title",
      "artist": "Artist Name",
      "album": "Album Name",
      "duration": 245,
      "path": "/media/audio/track.mp3",
      "format": "mp3",
      "bitrate": 320,
      "size": 9830400
    }
  ]
}
```

**Loading Process**:
1. Read JSON file from `config.AUDIO_LIBRARY_PATH`
2. Parse JSON into `AudioLibrary` type
3. Index files by ID in Map for fast lookup
4. Log statistics (total files, formats, total size)

**Validation**:
- Uses `fs.access()` to check file existence
- Called before creating session (fail fast if file missing)
- Async validation to avoid blocking

**Error Handling**:
- Throws error if JSON file not found or invalid
- Logs warnings for files that don't exist on filesystem
- Allows partial library loading (missing files logged but not fatal)

**Location**: `/Users/ianandrewson/coding/projects/straimer/backend/src/services/AudioLibrary.ts`

---

## Service Interaction Patterns

### Session Creation Flow
```
Client → SessionManager.createSession()
            ↓
SessionManager → AudioLibrary.getById() + validate()
            ↓
SessionManager → FfmpegManager.spawn()
            ↓
FfmpegManager → BufferStore.set() (via file watchers)
            ↓
SessionManager → BufferStore.generateMasterPlaylist()
            ↓
SessionManager → Return sessionId to client
```

### Streaming Flow
```
Client → Stream Route
            ↓
Route → SessionManager.updateLastAccessed()
            ↓
Route → BufferStore.get()
            ↓
BufferStore → Return buffer to route
            ↓
Route → Send buffer to client
```

### Cleanup Flow
```
Idle Timer Expires
            ↓
SessionManager.terminateSession()
            ↓
FfmpegManager.killProcess() (SIGTERM → SIGKILL)
            ↓
BufferStore.clear(sessionId)
            ↓
SessionManager → Remove from registry
```

---

## Dependency Injection

Services use constructor injection for dependencies:

```typescript
// Application startup (index.ts)
const bufferStore = new BufferStore();
const audioLibrary = new AudioLibrary();
const ffmpegManager = new FfmpegManager(bufferStore);
const sessionManager = new SessionManager(bufferStore, audioLibrary, ffmpegManager);
```

**Benefits**:
- Testability (can inject mocks)
- Flexibility (can swap implementations)
- Clear dependency graph

---

## Error Handling

### Service-Level Errors
Services throw descriptive errors with context:

```typescript
throw new Error(`Audio file not found: ${audioFileId}`);
throw new Error(`Session not found: ${sessionId}`);
throw new Error(`ffmpeg process failed: ${error.message}`);
```

### Route-Level Handling
Routes catch service errors and return appropriate HTTP responses:

```typescript
try {
  const sessionId = await sessionManager.createSession(audioFileId);
  res.status(HTTP_STATUS.CREATED).json({ sessionId });
} catch (error) {
  res.status(HTTP_STATUS.BAD_REQUEST).json({
    error: error.message
  });
}
```

---

## Testing Services

### Unit Testing
```typescript
describe('BufferStore', () => {
  it('stores and retrieves buffers', () => {
    const store = new BufferStore();
    const buffer = Buffer.from('test');

    store.set('sess_123', 'test.m3u8', buffer);
    const retrieved = store.get('sess_123', 'test.m3u8');

    expect(retrieved).toEqual(buffer);
  });
});
```

### Integration Testing
```typescript
describe('SessionManager', () => {
  it('creates session and spawns ffmpeg', async () => {
    const bufferStore = new BufferStore();
    const audioLibrary = new AudioLibrary();
    const ffmpegManager = new FfmpegManager(bufferStore);
    const sessionManager = new SessionManager(bufferStore, audioLibrary, ffmpegManager);

    await sessionManager.initialize();
    const sessionId = await sessionManager.createSession('audio-001');

    expect(sessionId).toMatch(/^sess_/);
    const session = sessionManager.getSession(sessionId);
    expect(session?.state).toBe(SESSION_STATES.INITIALIZING);
  });
});
```

---

## Performance Monitoring

### Memory Usage
```typescript
// Get buffer store statistics
const stats = bufferStore.getStats();
console.log(`Total memory: ${stats.totalBytes} bytes`);
console.log(`Sessions: ${stats.sessionCount}`);
console.log(`Files: ${stats.totalFiles}`);
```

### Session Metrics
```typescript
// Get session manager statistics
const stats = sessionManager.getStats();
console.log(`Active sessions: ${stats.activeCount}`);
console.log(`Idle sessions: ${stats.idleCount}`);
```

### Health Endpoint
```typescript
GET /health
{
  "status": "ok",
  "sessions": 3,
  "activeStreams": 2,
  "memory": {
    "rss": "450 MB",
    "heapUsed": "350 MB",
    "heapPercent": "70.0%"
  },
  "buffers": {
    "totalFiles": 45,
    "totalSize": "450 MB"
  }
}
```

---

## Common Issues

**Issue**: ffmpeg process not starting
- **Cause**: ffmpeg not installed or not in PATH
- **Solution**: Install ffmpeg (`apt install ffmpeg`), verify with `ffmpeg -version`

**Issue**: Audio file not found
- **Cause**: Path in audio-library.json incorrect or file deleted
- **Solution**: Verify file paths, regenerate library JSON

**Issue**: High memory usage
- **Cause**: Too many active sessions, segments not clearing
- **Solution**: Reduce SESSION_IDLE_TIMEOUT, limit concurrent sessions

**Issue**: Sessions not cleaning up
- **Cause**: Client continuously accessing stream
- **Solution**: Implement explicit DELETE endpoint call in client

---

## Future Enhancements

- [ ] Add session queueing (limit concurrent ffmpeg processes)
- [ ] Add metrics collection (Prometheus/StatsD)
- [ ] Add session persistence (Redis/database for multi-instance deployments)
- [ ] Add audio metadata extraction (duration, bitrate, codec)
- [ ] Add audio transcoding quality presets (low/medium/high)
- [ ] Add segment eviction policy (LRU cache for segments)

---

## Dependencies

- **uuid** (^9.0.1) - Session ID generation
- **child_process** (Node.js built-in) - ffmpeg spawning
- **fs** (Node.js built-in) - File operations and watching

---

**Location**: `/Users/ianandrewson/coding/projects/straimer/backend/src/services/`
**Key Files**: `SessionManager.ts`, `FfmpegManager.ts`, `BufferStore.ts`, `AudioLibrary.ts`
