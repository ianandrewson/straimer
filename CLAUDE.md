# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Straimer is a media streaming application designed for Raspberry Pi. It streams audio files to mobile clients using HLS (HTTP Live Streaming) with adaptive bitrate streaming (64k, 128k, 256k) optimized for cellular networks.

## Technology Stack

- **Backend**: Node.js + Express + TypeScript
- **Streaming**: ffmpeg with HLS protocol
- **Package Manager**: Yarn workspaces (monorepo)
- **Logging**: Pino
- **Environment**: dotenv

## Common Commands

### Installation
```bash
yarn install
```

### Development
```bash
# Run backend in development mode with hot reload
yarn dev:backend

# Type checking
yarn workspace backend type-check

# Linting
yarn workspace backend lint
```

### Building
```bash
# Build backend TypeScript to JavaScript
yarn build:backend
```

### Production
```bash
# Run production build
yarn start:backend
```

## Project Structure

```
straimer/
├── backend/               # Node.js backend server
│   ├── src/
│   │   ├── index.ts      # Application entry point
│   │   ├── config/       # Configuration (env.ts, constants.ts)
│   │   ├── middleware/   # Express middleware (auth, error, logging)
│   │   ├── routes/       # API routes (session, stream, library)
│   │   ├── services/     # Core services (SessionManager, FfmpegManager, etc)
│   │   ├── models/       # TypeScript types and interfaces
│   │   └── utils/        # Utilities (logger, validation, cleanup)
│   ├── data/             # Audio library JSON (gitignored)
│   └── dist/             # Compiled JavaScript (gitignored)
└── frontend/             # Mobile client (placeholder)
```

## Architecture

The backend follows a 3-layer architecture:

1. **HTTP Routing Layer (Express)**: Handles authentication, routing, and serves HLS content
2. **Session Manager**: Tracks active streams, spawns/manages ffmpeg processes, handles cleanup
3. **Transcoder/Segmenter (ffmpeg)**: Processes audio files and outputs HLS playlists/segments

### Key Design Decisions

- **Memory-only streaming**: ffmpeg outputs to pipes, Node stores segments in memory (no disk I/O)
- **Single ffmpeg process per session**: One process outputs all 3 bitrates simultaneously for efficiency
- **Session lifecycle**: INITIALIZING → READY → ACTIVE → IDLE → TERMINATED (5-min idle timeout)
- **Authentication**: Bearer token in Authorization header

## Configuration

Environment variables are loaded from `backend/.env`:

- `PORT`: Server port (default: 3000)
- `API_KEY`: Authentication token
- `AUDIO_LIBRARY_PATH`: Path to audio-library.json
- `SESSION_IDLE_TIMEOUT_MS`: Session timeout (default: 5 minutes)
- `HLS_BITRATES`: Comma-separated bitrates (default: 64,128,256)
- `LOG_LEVEL`: Logging level (default: info)

See `backend/.env.example` for full list.

## Code Conventions

- **Naming**: Config keys use CONSTANT_CASE, other code uses camelCase
- **Imports**: ES6 imports, absolute paths from src/
- **Error handling**: Use HTTP status constants from config/constants.ts
- **Logging**: Use structured logging with Pino logger from utils/logger.ts
- **Types**: All services and routes should have proper TypeScript types

## Development Workflow

1. Update environment variables in `backend/.env`
2. Run `yarn dev:backend` to start the development server
3. Check logs for any configuration issues
4. Test health endpoint: `curl http://localhost:3000/health`

## Implementation Status

**Phase 1: Foundation** ✓ Complete
- Monorepo structure with Yarn workspaces
- TypeScript configuration
- Config loader and structured logging
- Basic Express server with health check

**Phase 2-5**: See [PLAN.md](./PLAN.md) for detailed implementation plan

## Important Notes

- Audio files are stored locally on the device, NOT in the repository
- The backend is optimized for Raspberry Pi (limited CPU/memory)
- All HLS content is served from memory to minimize disk I/O
- Sessions auto-cleanup after 5 minutes of inactivity
