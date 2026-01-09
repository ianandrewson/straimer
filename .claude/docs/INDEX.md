# Straimer Codebase Documentation

## Overview

Straimer is an HLS audio streaming server optimized for Raspberry Pi, featuring adaptive bitrate streaming (64k, 128k, 256k) for mobile clients. The system uses ffmpeg for transcoding and Node.js for session management and content delivery.

**Architecture**: 3-layer design (HTTP → Session Manager → ffmpeg)
**Target Platform**: Raspberry Pi 4 (ARM64)
**Performance**: 200-500MB memory, 5-10 concurrent streams

## Quick Start

```bash
# Install dependencies
yarn install

# Configure environment
cp backend/.env.example backend/.env
# Edit backend/.env with your settings

# Run development server
yarn dev:backend

# Build for production
yarn build:backend
yarn start:backend
```

## Project Structure

```
straimer/
├── backend/               # Node.js streaming server
│   ├── src/
│   │   ├── config/       # Environment and constants
│   │   ├── middleware/   # Auth, logging, error handling
│   │   ├── models/       # TypeScript types
│   │   ├── routes/       # API endpoints
│   │   ├── services/     # Core business logic
│   │   └── utils/        # Helper utilities
│   ├── data/             # Audio library JSON (gitignored)
│   ├── dist/             # Compiled output (gitignored)
│   └── tests/            # Integration tests
├── frontend/             # Mobile client (placeholder)
└── docs/                 # Project documentation
```

## Core Domains

### 1. Configuration (`backend/src/config/`)
Centralized environment variable management and application constants.

**Key Files**:
- `env.ts` - Environment variable loader with defaults
- `constants.ts` - HTTP status codes, session states, error messages

**See**: [Configuration Domain](./domains/configuration.md)

---

### 2. Middleware (`backend/src/middleware/`)
Express middleware for cross-cutting concerns.

**Key Files**:
- `auth.ts` - Bearer token authentication
- `logger.ts` - HTTP request logging with Pino
- `error.ts` - Global error handler and 404 handler

**See**: [Middleware Domain](./domains/middleware.md)

---

### 3. Models (`backend/src/models/`)
TypeScript type definitions and interfaces.

**Key Files**:
- `Session.ts` - Session state and metadata types
- `AudioFile.ts` - Audio library file structure
- `StreamConfig.ts` - ffmpeg streaming configuration

**See**: [Models Domain](./domains/models.md)

---

### 4. Routes (`backend/src/routes/`)
API endpoint handlers and route registration.

**Key Files**:
- `index.ts` - Root router with route aggregation
- `session.ts` - Session CRUD operations
- `library.ts` - Audio file listing
- `stream.ts` - HLS content delivery

**See**: [Routes Domain](./domains/routes.md)

---

### 5. Services (`backend/src/services/`)
Core business logic and orchestration layer.

**Key Files**:
- `SessionManager.ts` - Session lifecycle management
- `FfmpegManager.ts` - Process spawning and management
- `BufferStore.ts` - In-memory HLS content storage
- `AudioLibrary.ts` - Audio file discovery and validation

**See**: [Services Domain](./domains/services.md)

---

### 6. Utils (`backend/src/utils/`)
Shared utilities and helper functions.

**Key Files**:
- `logger.ts` - Pino logger configuration
- `validation.ts` - Joi schema validators
- `cleanup.ts` - Graceful shutdown handler
- `memory.ts` - Memory monitoring and reporting

**See**: [Utils Domain](./domains/utils.md)

---

## Key Patterns

### Session State Machine
Sessions transition through: `INITIALIZING → READY → ACTIVE → IDLE → TERMINATED`

**See**: [Session State Machine Pattern](./patterns/session-state-machine.md)

---

### Memory-Only Streaming
ffmpeg outputs to pipes, Node.js stores segments in memory to minimize disk I/O on Raspberry Pi SD cards.

**See**: [Memory-Only Streaming Pattern](./patterns/memory-streaming.md)

---

### Single Process Multi-Bitrate
One ffmpeg process outputs all 3 bitrates simultaneously for CPU efficiency.

**See**: [Multi-Bitrate Transcoding Pattern](./patterns/multi-bitrate-transcoding.md)

---

### Bearer Token Authentication
Simple token-based auth via `Authorization: Bearer <token>` header.

**See**: [Authentication Pattern](./patterns/authentication.md)

---

## API Reference

### Public Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check with system stats |

### Protected Endpoints (Require Bearer Token)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/library` | List audio files |
| POST | `/api/sessions` | Create streaming session |
| GET | `/api/sessions` | List all sessions |
| GET | `/api/sessions/:sessionId` | Get session details |
| DELETE | `/api/sessions/:sessionId` | Terminate session |
| GET | `/stream/:sessionId/master.m3u8` | HLS master playlist |
| GET | `/stream/:sessionId/:quality/playlist.m3u8` | HLS variant playlist |
| GET | `/stream/:sessionId/:quality/:segment` | HLS media segments |

**Full API Documentation**: See [docs/backend/API.md](../../docs/backend/API.md)

---

## Data Flows

### Session Creation Flow
1. Client → `POST /api/sessions` with `audioFileId`
2. SessionManager validates audio file exists
3. SessionManager spawns ffmpeg process
4. FfmpegManager captures HLS output to BufferStore
5. Response returns `sessionId` to client

### Streaming Flow
1. Client → `GET /stream/:sessionId/:quality/playlist.m3u8`
2. StreamRoutes updates session last accessed time
3. StreamRoutes retrieves playlist from BufferStore
4. BufferStore returns in-memory HLS content
5. Client receives playlist and requests segments

### Cleanup Flow
1. Idle timer expires (5 minutes default)
2. SessionManager terminates session
3. FfmpegManager kills ffmpeg process
4. BufferStore clears session buffers
5. Session removed from registry

---

## Configuration

Environment variables (see `backend/.env.example`):

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `API_KEY` | - | Authentication token |
| `AUDIO_LIBRARY_PATH` | ./data/audio-library.json | Audio library file |
| `SESSION_IDLE_TIMEOUT_MS` | 300000 | Session timeout (5 min) |
| `HLS_BITRATES` | 64,128,256 | Output bitrates (kbps) |
| `LOG_LEVEL` | info | Pino log level |

**Full Configuration Guide**: See [Configuration Domain](./domains/configuration.md)

---

## Development

### Common Commands

```bash
# Install dependencies
yarn install

# Development mode (hot reload)
yarn dev:backend

# Type checking
yarn workspace backend type-check

# Linting
yarn workspace backend lint

# Build production
yarn build:backend

# Run production
yarn start:backend

# Test ffmpeg integration
yarn workspace backend test:ffmpeg
```

### Code Conventions

- **Naming**: `UPPER_SNAKE_CASE` for constants, `camelCase` for variables/functions, `PascalCase` for classes
- **Imports**: ES6 modules with absolute paths from `src/`
- **Error Handling**: Use HTTP status constants from `config/constants.ts`
- **Logging**: Structured JSON logging with Pino logger
- **Types**: Strict TypeScript mode, explicit types for all function signatures

---

## Dependencies

### Runtime
- **express** (^4.18.2) - Web framework
- **pino** (^8.17.2) - Structured logging
- **joi** (^17.12.0) - Schema validation
- **uuid** (^9.0.1) - Session ID generation
- **dotenv** (^16.4.1) - Environment configuration

### External
- **ffmpeg** - Audio transcoding and HLS segmentation (system dependency)

---

## Testing

```bash
# Test ffmpeg integration
yarn workspace backend test:ffmpeg

# Manual API testing
./backend/tests/test-api.sh
```

**Note**: Test suite is minimal. Integration tests cover ffmpeg spawning and HLS generation.

---

## Deployment

**Target Platform**: Raspberry Pi 4 (2GB+ RAM recommended)

**Prerequisites**:
- Node.js 20.x
- ffmpeg installed (`apt install ffmpeg`)
- Audio files accessible on device
- Audio library JSON generated

**Deployment Guide**: See [docs/backend/DEPLOYMENT.md](../../docs/backend/DEPLOYMENT.md)

---

## Performance Considerations

### Memory Management
- Monitor memory usage via `/health` endpoint
- Buffer store clears segments after session termination
- Memory monitoring alerts at 500MB threshold

### CPU Efficiency
- Single ffmpeg process per session (multi-output)
- HLS segment duration: 10 seconds (configurable)
- Adaptive bitrate: 64k, 128k, 256k

### Concurrency Limits
- Target: 5-10 concurrent streams on Raspberry Pi 4
- Each stream: ~20-40% CPU, ~50-100MB RAM
- Adjust `SESSION_IDLE_TIMEOUT_MS` based on load

---

## Troubleshooting

### Common Issues

**ffmpeg not found**:
```bash
# Install ffmpeg
sudo apt install ffmpeg

# Verify installation
ffmpeg -version
```

**Session timeout too short**:
```env
# Increase timeout in .env
SESSION_IDLE_TIMEOUT_MS=600000  # 10 minutes
```

**High memory usage**:
- Check active session count: `GET /health`
- Reduce concurrent streams
- Lower HLS segment duration

**Audio file not found**:
- Verify `AUDIO_LIBRARY_PATH` points to valid JSON
- Ensure audio files exist at paths in library
- Check file permissions

---

## Architecture Diagrams

### High-Level Architecture
```
[Mobile Client]
      |
      v
[Express Server] ←→ [SessionManager] ←→ [FfmpegManager]
      |                    |                    |
      v                    v                    v
[BufferStore] ←→ [AudioLibrary]         [ffmpeg process]
```

### Session Lifecycle
```
CREATE → INITIALIZING → READY → ACTIVE → IDLE → TERMINATED
         (spawn ffmpeg)  (2s)   (access)  (timeout)
```

---

## Related Documentation

- [API Reference](../../docs/backend/API.md)
- [Deployment Guide](../../docs/backend/DEPLOYMENT.md)
- [Project Instructions](../../CLAUDE.md)

---

## Contributing

This project follows strict TypeScript conventions and uses structured logging. When modifying code:

1. Run type checking: `yarn workspace backend type-check`
2. Run linting: `yarn workspace backend lint`
3. Test locally: `yarn dev:backend`
4. Verify ffmpeg integration: `yarn workspace backend test:ffmpeg`

---

**Last Updated**: 2026-01-09
**Version**: 1.0.0
**Maintainer**: See package.json
