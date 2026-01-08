# Implementation Plan: Straimer Media Streaming Backend

## Overview
Build a Node.js HLS streaming backend optimized for Raspberry Pi with cellular connectivity. The system uses ffmpeg to transcode audio files into adaptive bitrate HLS streams (64k, 128k, 256k) served entirely from memory.

## Architecture (3 Layers)
1. **HTTP Routing Layer (Express)**: Authentication, routing, HLS content serving
2. **Session Manager (Node)**: Tracks streams, spawns/manages ffmpeg processes, handles cleanup
3. **Transcoder/Segmenter (ffmpeg)**: Processes audio files, outputs HLS playlists and segments to stdout

## Monorepo Structure

```
straimer/
├── package.json                    # Root package.json (npm workspaces)
├── .gitignore                      # ✓ Exists
├── CLAUDE.md                       # ✓ Exists - will update
├── README.md                       # Create: project overview
│
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   ├── src/
│   │   ├── index.ts                    # App entry point
│   │   ├── config/
│   │   │   ├── env.ts                  # Environment loader
│   │   │   └── constants.ts            # Bitrates, timeouts
│   │   ├── middleware/
│   │   │   ├── auth.ts                 # Bearer token auth
│   │   │   ├── error.ts                # Error handling
│   │   │   └── logger.ts               # Request logging
│   │   ├── routes/
│   │   │   ├── index.ts                # Route aggregator
│   │   │   ├── session.ts              # POST/GET/DELETE /api/sessions
│   │   │   ├── stream.ts               # GET /stream/:id/...
│   │   │   └── library.ts              # GET /api/library
│   │   ├── services/
│   │   │   ├── SessionManager.ts       # Core lifecycle manager
│   │   │   ├── FfmpegManager.ts        # Process spawner
│   │   │   ├── BufferStore.ts          # In-memory buffers
│   │   │   └── AudioLibrary.ts         # JSON reader
│   │   ├── models/
│   │   │   ├── Session.ts              # Session types
│   │   │   ├── StreamConfig.ts         # Config types
│   │   │   └── AudioFile.ts            # Audio metadata types
│   │   └── utils/
│   │       ├── logger.ts               # Pino structured logging
│   │       ├── validation.ts           # Input validation
│   │       └── cleanup.ts              # Graceful shutdown
│   └── data/
│       └── audio-library.json          # Audio file registry (gitignored)
│
└── frontend/                           # Placeholder for now
    ├── package.json
    └── README.md
```

## Key Technical Decisions

### 1. ffmpeg Strategy: Single Process with Multiple Outputs
- **One ffmpeg process per session** outputs all 3 bitrates simultaneously
- More efficient than 3 separate processes on Raspberry Pi (limited CPU cores)
- Uses `-map` directive with separate pipes (pipe:4, pipe:5, pipe:6)

**Command structure**:
```bash
ffmpeg -i input.mp3 \
  -map 0:a -c:a aac -b:a 64k -hls_time 10 -hls_list_size 0 -f hls pipe:4 \
  -map 0:a -c:a aac -b:a 128k -hls_time 10 -hls_list_size 0 -f hls pipe:5 \
  -map 0:a -c:a aac -b:a 256k -hls_time 10 -hls_list_size 0 -f hls pipe:6
```

### 2. Memory Buffer Strategy
- ffmpeg outputs to pipes, Node captures into `Map<sessionId, Map<filename, Buffer>>`
- Master playlist generated dynamically
- Segments stored as Buffer objects in memory (no disk I/O)

**Buffer structure**:
```typescript
{
  "sess_abc123": {
    "master.m3u8": Buffer,
    "64k/playlist.m3u8": Buffer,
    "64k/segment0.ts": Buffer,
    "128k/playlist.m3u8": Buffer,
    // ...
  }
}
```

### 3. HLS Playlist Hierarchy
```
GET /stream/:sessionId/master.m3u8           → Master playlist
GET /stream/:sessionId/64k/playlist.m3u8     → Variant playlist
GET /stream/:sessionId/256k/segment0.ts      → TS segment
```

### 4. Session Lifecycle
- **States**: INITIALIZING → READY → ACTIVE → IDLE → TERMINATED
- **Idle timeout**: 5 minutes (configurable)
- **Cleanup interval**: Every 1 minute, check for idle sessions
- **Keep-alive**: Each segment request resets idle timer

## API Endpoints

### POST /api/sessions
Create streaming session
```json
Request: { "audioFileId": "audio-001" }
Response: {
  "sessionId": "sess_abc123",
  "masterPlaylistUrl": "/stream/sess_abc123/master.m3u8"
}
```

### GET /api/sessions/:sessionId
Get session status

### DELETE /api/sessions/:sessionId
Terminate session manually

### GET /api/library
List available audio files from JSON registry

### GET /stream/:sessionId/master.m3u8
Serve master HLS playlist (text/vnd.apple.mpegurl)

### GET /stream/:sessionId/:quality/playlist.m3u8
Serve variant playlist (from memory buffer)

### GET /stream/:sessionId/:quality/:segment.ts
Serve TS segment (from memory buffer)

## Dependencies

**Production**:
```json
{
  "express": "^4.18.2",
  "dotenv": "^16.4.1",
  "uuid": "^9.0.1",
  "pino": "^8.17.2",
  "pino-http": "^9.0.0",
  "joi": "^17.12.0"
}
```

**Development**:
```json
{
  "typescript": "^5.3.3",
  "@types/node": "^20.11.0",
  "@types/express": "^4.17.21",
  "tsx": "^4.7.0",
  "nodemon": "^3.0.3",
  "eslint": "^8.56.0"
}
```

## Core Service Implementations

### SessionManager.ts
- Maintains `Map<sessionId, Session>` registry
- Creates sessions with UUIDs
- Coordinates FfmpegManager and BufferStore
- Implements idle timeout cleanup (runs every minute)
- Handles graceful termination

**Key methods**:
```typescript
async createSession(audioFileId: string, qualities: string[]): Promise<string>
getSession(sessionId: string): Session | undefined
async terminateSession(sessionId: string): Promise<void>
updateLastAccessed(sessionId: string): void
```

### FfmpegManager.ts
- Spawns ffmpeg child processes with adaptive bitrate config
- Captures output from multiple pipes (stdio[4], stdio[5], stdio[6])
- Parses HLS playlists and segments
- Sends parsed data to BufferStore
- Handles ffmpeg errors and crashes

**Critical parsing logic**:
- Each pipe outputs playlists and segments for one quality level
- Parse m3u8 text vs binary TS segments
- Store with quality-prefixed paths (e.g., "64k/segment0.ts")

### BufferStore.ts
- Stores all HLS content in memory
- Nested Map structure: `Map<sessionId, Map<filename, Buffer>>`
- Generates master.m3u8 dynamically
- Provides fast lookup by session + filename
- Clears all buffers on session termination

**Key methods**:
```typescript
set(sessionId: string, filename: string, data: Buffer): void
get(sessionId: string, filename: string): Buffer | undefined
clear(sessionId: string): void
generateMasterPlaylist(sessionId: string, qualities: string[]): string
```

### AudioLibrary.ts
- Reads audio-library.json from disk
- Validates file paths exist
- Caches in memory
- Provides metadata (title, duration, path)

**JSON format**:
```json
{
  "files": [
    {
      "id": "audio-001",
      "title": "Morning Meditation",
      "path": "/media/audio/meditation.mp3",
      "duration": 1800
    }
  ]
}
```

## Authentication
- **Method**: Bearer token in `Authorization` header
- **Validation**: Middleware checks against `API_KEY` environment variable
- **Scope**: Applied to `/api/*` and `/stream/*` routes
- **Response**: 401 if missing/invalid

## Configuration (.env)
```bash
PORT=3000
NODE_ENV=production
API_KEY=your-secret-api-key
AUDIO_LIBRARY_PATH=/media/audio-library.json
SESSION_IDLE_TIMEOUT_MS=300000  # 5 minutes
HLS_SEGMENT_DURATION=10
HLS_BITRATES=64,128,256
LOG_LEVEL=info
```

## Raspberry Pi Optimizations

1. **Memory**: Aggressive session cleanup, segment eviction after serving
2. **CPU**: Use ffmpeg `-preset ultrafast`, limit threads with `-threads 2`
3. **Network**: 10-second segments (balance latency/overhead)
4. **Disk**: All in-memory buffers, no segment writing

## Error Handling

- **400 Validation**: Invalid audio file ID, malformed requests
- **401 Auth**: Missing/invalid API key
- **404 Not Found**: Session doesn't exist, segment not ready yet
- **500 Server**: ffmpeg crash, out of memory, file I/O errors

**ffmpeg error handling**:
- Listen for 'error' and 'exit' events on child process
- Terminate session on crash
- Log stderr output for debugging

## Implementation Sequence

### Phase 1: Foundation
1. Set up monorepo with npm workspaces
2. Create backend folder with TypeScript config
3. Implement config loader (env.ts) and logger (pino)
4. Create basic Express server with health check

### Phase 2: Core Services
5. Implement AudioLibrary service (read JSON)
6. Create BufferStore with in-memory Map
7. Build SessionManager with lifecycle logic
8. Implement auth middleware

### Phase 3: ffmpeg Integration
9. Create FfmpegManager with multi-output spawning
10. Implement pipe parsing for playlists and segments
11. Wire BufferStore to receive ffmpeg output
12. Test with sample audio file (5-10 min)

### Phase 4: API Endpoints
13. Implement session creation endpoint
14. Add session status/deletion endpoints
15. Create library listing endpoint
16. Build HLS serving endpoints (master, variant, segments)

### Phase 5: Polish
17. Add comprehensive error handling
18. Implement idle timeout and cleanup
19. Add graceful shutdown handling
20. Update CLAUDE.md with commands and architecture

## Testing Approach

### Manual Testing (Priority)
1. Create session via `curl` or Postman
2. Open master playlist URL in VLC or Safari (native HLS support)
3. Verify playback starts and switches quality levels
4. Monitor memory usage with `htop` on Raspberry Pi
5. Test multiple concurrent sessions
6. Verify cleanup after 5 minutes of idle
7. Test with 4-hour audio file (memory pressure)

### Test Commands
```bash
# Create session
curl -H "Authorization: Bearer <API_KEY>" \
  -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"audioFileId": "audio-001"}'

# Get session status
curl -H "Authorization: Bearer <API_KEY>" \
  http://localhost:3000/api/sessions/sess_abc123

# Play in VLC
vlc http://localhost:3000/stream/sess_abc123/master.m3u8
```

## Verification Steps

After implementation is complete:

1. **Functional verification**:
   - Create session, get master playlist URL
   - Open URL in VLC or Safari
   - Verify audio plays without buffering
   - Check network tab shows segments loading

2. **Resource verification**:
   - Monitor memory usage during 1-hour playback
   - Check CPU usage stays below 50% on Raspberry Pi
   - Verify no disk writes to /tmp or other locations

3. **Cleanup verification**:
   - Create session, wait 5 minutes without requests
   - Check session is terminated and memory is freed
   - Verify ffmpeg process is killed

4. **Error handling**:
   - Request invalid audio file ID (should return 400)
   - Request without auth header (should return 401)
   - Request segment before ready (should return 404)

## Critical Files

These are the most important files to get right:

1. **backend/src/services/SessionManager.ts** - Core orchestrator, manages all lifecycle
2. **backend/src/services/FfmpegManager.ts** - Most complex, handles ffmpeg spawning and parsing
3. **backend/src/services/BufferStore.ts** - Critical for memory-only storage
4. **backend/src/routes/stream.ts** - Main user-facing endpoint for HLS serving
5. **backend/src/index.ts** - Application entry point, wires everything together

## Potential Challenges

1. **ffmpeg output parsing**: Distinguishing playlists from segments in stdout
   - **Solution**: Use separate file descriptors (pipe:4, 5, 6) for each quality

2. **Memory pressure**: 4-hour audio could generate hundreds of MB
   - **Solution**: Implement sliding window (keep last N segments), monitor memory

3. **Race conditions**: Client requests segment before ffmpeg generates it
   - **Solution**: Return 404 with "initializing" state, client retries

4. **ffmpeg crashes**: Invalid audio files or unexpected formats
   - **Solution**: Pre-validate with ffprobe, catch exit codes, terminate gracefully
