# Prime Command

This command primes Claude with essential codebase knowledge for effective development assistance.

---

## Codebase Overview

**Straimer** is an HLS audio streaming server optimized for Raspberry Pi. It streams audio files to mobile clients using adaptive bitrate streaming (64k, 128k, 256k) over HTTP.

### Architecture
- **3-Layer Design**: HTTP Routing (Express) → Session Manager → ffmpeg Transcoder
- **Technology**: Node.js + TypeScript + Express + ffmpeg
- **Deployment**: Raspberry Pi 4 (ARM64, 2-4GB RAM)
- **Performance Target**: 5-10 concurrent streams, 200-500MB memory

---

## Project Structure

```
straimer/
├── backend/               # Node.js streaming server
│   ├── src/
│   │   ├── config/       # Environment variables, constants
│   │   ├── middleware/   # Auth, logging, error handling
│   │   ├── models/       # TypeScript types (Session, AudioFile, StreamConfig)
│   │   ├── routes/       # API endpoints (session, library, stream)
│   │   ├── services/     # Core logic (SessionManager, FfmpegManager, BufferStore, AudioLibrary)
│   │   └── utils/        # Logger, validation, cleanup, memory monitoring
│   ├── data/             # Audio library JSON (gitignored)
│   ├── dist/             # Compiled JavaScript (gitignored)
│   └── tests/            # Integration tests
├── frontend/             # Mobile client (placeholder)
└── docs/                 # Documentation
```

---

## Core Domains

### 1. Configuration (`backend/src/config/`)
- **env.ts**: Environment variable loader with defaults
- **constants.ts**: HTTP status codes, session states, error messages
- **Key Variables**: PORT, API_KEY, AUDIO_LIBRARY_PATH, SESSION_IDLE_TIMEOUT_MS, HLS_BITRATES

### 2. Middleware (`backend/src/middleware/`)
- **auth.ts**: Bearer token authentication (all routes except `/health`)
- **logger.ts**: Pino HTTP request logging
- **error.ts**: Global error handler and 404 handler

### 3. Models (`backend/src/models/`)
- **Session.ts**: Session state machine types (INITIALIZING → READY → ACTIVE → IDLE → TERMINATED)
- **AudioFile.ts**: Audio library file structure
- **StreamConfig.ts**: ffmpeg configuration types

### 4. Routes (`backend/src/routes/`)
- **library.ts**: `GET /api/library` - List audio files
- **session.ts**: Session CRUD (`POST/GET/DELETE /api/sessions`)
- **stream.ts**: HLS content delivery (`GET /stream/:sessionId/...`)
- **Authentication**: Bearer token required for all routes

### 5. Services (`backend/src/services/`)
- **SessionManager**: Session lifecycle, state transitions, idle timeout
- **FfmpegManager**: Spawn ffmpeg processes, file watching, multi-bitrate output
- **BufferStore**: In-memory HLS content storage (Map<sessionId, Map<filename, Buffer>>)
- **AudioLibrary**: Load/validate audio files from JSON

### 6. Utils (`backend/src/utils/`)
- **logger.ts**: Pino logger instance (structured JSON logging)
- **validation.ts**: Joi request validation
- **cleanup.ts**: Graceful shutdown (SIGINT/SIGTERM)
- **memory.ts**: Memory monitoring and alerting

---

## Key Patterns

### Session State Machine
**States**: INITIALIZING → READY → ACTIVE → IDLE → TERMINATED

**Transitions**:
- POST /api/sessions → INITIALIZING
- ffmpeg spawned + 2s delay → READY
- Client accesses stream → ACTIVE
- Idle timeout (5 min default) → IDLE → TERMINATED
- DELETE /api/sessions → TERMINATED

**Idle Management**:
- Last accessed timestamp updated on each stream request
- Background cleanup every 1 minute
- Configurable timeout via SESSION_IDLE_TIMEOUT_MS

### Memory-Only Streaming
**Flow**:
1. ffmpeg outputs HLS to `/tmp/straimer-<sessionId>/`
2. File watchers capture output immediately
3. Store in BufferStore (Node.js heap memory)
4. Delete temporary files
5. Serve segments directly from memory

**Benefits**:
- Minimizes SD card wear on Raspberry Pi
- ~50ms disk read eliminated
- Automatic cleanup (garbage collection)

**Memory**: ~5-10MB per active session

### Multi-Bitrate Transcoding
**Single ffmpeg process outputs 3 bitrates simultaneously**:
- Decode once, encode 3 times in parallel
- CPU savings: ~33% vs 3 separate processes
- Memory savings: ~50% vs 3 separate processes

**ffmpeg Command**:
```bash
ffmpeg -i input.mp3 -preset ultrafast -threads 2 \
  -map 0:a -c:a aac -b:a 64k -f hls 64k/playlist.m3u8 \
  -map 0:a -c:a aac -b:a 128k -f hls 128k/playlist.m3u8 \
  -map 0:a -c:a aac -b:a 256k -f hls 256k/playlist.m3u8
```

### Bearer Token Authentication
**All routes except `/health` require**:
```
Authorization: Bearer <API_KEY>
```

**Validation**: Simple string comparison against `config.API_KEY`

**No**: Token expiration, per-user tokens, rate limiting (future enhancements)

---

## API Endpoints

### Public
- `GET /health` - Health check with system stats

### Protected (Bearer Token Required)
- `GET /api/library` - List audio files
- `POST /api/sessions` - Create session (body: `{audioFileId, qualities?}`)
- `GET /api/sessions` - List all sessions
- `GET /api/sessions/:sessionId` - Get session details
- `DELETE /api/sessions/:sessionId` - Terminate session
- `GET /stream/:sessionId/master.m3u8` - HLS master playlist
- `GET /stream/:sessionId/:quality/playlist.m3u8` - Variant playlist
- `GET /stream/:sessionId/:quality/:segment` - Media segments

---

## Common Development Tasks

### Running the Server
```bash
yarn install                    # Install dependencies
cp backend/.env.example backend/.env  # Configure environment
yarn dev:backend                # Development (hot reload)
yarn build:backend              # Build TypeScript
yarn start:backend              # Production
```

### Type Checking and Linting
```bash
yarn workspace backend type-check
yarn workspace backend lint
```

### Testing
```bash
yarn workspace backend test:ffmpeg  # Test ffmpeg integration
./backend/tests/test-api.sh         # Manual API testing
```

### Creating Audio Library JSON
```json
{
  "version": "1.0",
  "files": [
    {
      "id": "audio-001",
      "title": "Track Title",
      "artist": "Artist Name",
      "path": "/media/audio/track.mp3",
      "duration": 245,
      "format": "mp3",
      "bitrate": 320
    }
  ]
}
```

---

## Code Conventions

### Naming
- **Constants**: UPPER_SNAKE_CASE (e.g., SESSION_STATES, HTTP_STATUS)
- **Variables/Functions**: camelCase (e.g., sessionManager, createSession)
- **Classes**: PascalCase (e.g., SessionManager, BufferStore)
- **Files**: camelCase.ts (e.g., sessionManager.ts)

### Imports
- ES6 modules (`import`/`export`)
- Absolute paths from `src/` (configured in tsconfig.json)

### Error Handling
- Use HTTP status constants from `config/constants.ts`
- Throw descriptive errors with context
- Let global errorHandler catch unhandled errors

### Logging
- Structured JSON logging with Pino
- Include context objects: `logger.info({ sessionId, state }, 'Message')`
- Appropriate levels: debug, info, warn, error, fatal

### TypeScript
- Strict mode enabled
- Explicit types for function signatures
- No `any` types
- Optional chaining (`?.`) and nullish coalescing (`??`)

---

## Common Issues

### ffmpeg Not Found
**Solution**: Install ffmpeg (`sudo apt install ffmpeg`)

### Session Timeout Too Short
**Solution**: Increase `SESSION_IDLE_TIMEOUT_MS` in `.env`

### High Memory Usage
**Solution**:
- Check active session count: `GET /health`
- Reduce concurrent streams
- Lower idle timeout

### 503 Service Unavailable When Streaming
**Cause**: Session still INITIALIZING (ffmpeg starting)
**Solution**: Wait 2-3 seconds after session creation

### 404 Not Found for Segments
**Cause**: ffmpeg still generating segment
**Solution**: Implement retry logic in client with exponential backoff

---

## Performance Characteristics

### Per Session
- **Memory**: 5-10MB (buffers) + 50-100MB (ffmpeg process)
- **CPU**: 20-40% (Raspberry Pi 4)
- **Network**: Up to 256kbps

### Raspberry Pi 4 Limits
- **Concurrent Streams**: 5-10 (target)
- **Total Memory**: 200-500MB (target)
- **Alert Threshold**: 500MB

---

## Dependencies

### Runtime
- express (^4.18.2) - Web framework
- pino (^8.17.2) - Structured logging
- joi (^17.12.0) - Validation
- uuid (^9.0.1) - Session IDs
- dotenv (^16.4.1) - Environment config
- cors (^2.8.5) - CORS middleware

### External
- ffmpeg (system dependency) - Audio transcoding and HLS

---

## Documentation

Full documentation available at:
- **Index**: `.claude/docs/INDEX.md`
- **Domains**: `.claude/docs/domains/*.md`
- **Patterns**: `.claude/docs/patterns/*.md`
- **Schema**: `.claude/docs/codebase-schema.yaml`
- **Project Instructions**: `CLAUDE.md`

---

## Quick Reference

### Create Session Flow
1. Client: `POST /api/sessions` with `{audioFileId}`
2. SessionManager validates audio file exists
3. SessionManager spawns ffmpeg process (state: INITIALIZING)
4. FfmpegManager watches output, captures to BufferStore
5. After 2s delay, state → READY
6. Response: `{sessionId, status: "INITIALIZING"}`

### Streaming Flow
1. Client: `GET /stream/:sessionId/master.m3u8`
2. Route updates session last accessed time (prevents timeout)
3. BufferStore returns master playlist from memory
4. Client selects quality, fetches variant playlist
5. Client fetches segments sequentially

### Cleanup Flow
1. No client access for 5 minutes (default)
2. SessionManager idle timer fires
3. State: ACTIVE → IDLE → TERMINATED
4. FfmpegManager kills ffmpeg (SIGTERM → SIGKILL)
5. BufferStore clears session buffers
6. SessionManager removes from registry

---

## When Assisting with Development

### Always Check
1. Is ffmpeg installed and accessible?
2. Are environment variables configured (especially API_KEY)?
3. Is audio library JSON valid and files accessible?
4. Are TypeScript types correct and strict mode satisfied?
5. Are errors logged with appropriate context?

### Code Modifications
1. Maintain existing patterns (DI, state machine, error handling)
2. Use existing utilities (logger, validation, cleanup)
3. Follow naming conventions
4. Add structured logging for debugging
5. Update types in `models/` if adding new interfaces
6. Run type-check and lint before committing

### Testing
1. Run `yarn dev:backend` and test manually
2. Check `/health` endpoint for system stats
3. Test full streaming flow (create session → fetch playlists → fetch segments)
4. Verify cleanup (wait for idle timeout or DELETE session)
5. Monitor memory usage during testing

---

**You are now primed to assist with Straimer development. Reference the full documentation for detailed implementation details.**
