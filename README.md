# Straimer

🎵 HLS adaptive bitrate streaming server optimized for Raspberry Pi

Straimer is a lightweight media streaming application that converts audio files into HLS (HTTP Live Streaming) format on-the-fly, enabling adaptive bitrate streaming to mobile clients over cellular networks.

## Key Features

- **Adaptive Bitrate Streaming**: Automatically adjusts quality (64k, 128k, 256k, 320k) based on network conditions
- **Memory-Efficient**: All HLS segments stored in memory, no disk I/O during streaming
- **Session-Based**: Each stream is an isolated session with automatic cleanup
- **Raspberry Pi Optimized**: Minimal CPU and memory footprint
- **Secure**: Bearer token authentication on all endpoints
- **Production Ready**: Comprehensive error handling, logging, and monitoring

## Architecture

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ HTTPS (HLS)
       ▼
┌─────────────┐
│    Nginx    │ (Optional reverse proxy)
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────┐
│     Express HTTP Server         │
├─────────────────────────────────┤
│  • Authentication Middleware    │
│  • Session Management           │
│  • API Routes (/api/...)        │
│  • Stream Routes (/stream/...)  │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│      SessionManager             │
├─────────────────────────────────┤
│  • Lifecycle Management         │
│  • Idle Timeout (5 min)         │
│  • Cleanup Scheduler            │
└──────┬──────────────────────────┘
       │
       ├──────────────┬────────────────┐
       ▼              ▼                ▼
┌────────────┐  ┌───────────┐  ┌──────────────┐
│  ffmpeg    │  │  Buffer   │  │    Audio     │
│  Manager   │  │  Store    │  │   Library    │
│            │  │           │  │              │
│ • Spawns   │  │ • Memory  │  │ • JSON File  │
│ • Monitors │  │ • Maps    │  │ • Metadata   │
│ • Captures │  │ • Playlists│ │ • Validation │
└────────────┘  └───────────┘  └──────────────┘
```

## Quick Start

### Prerequisites

- **Node.js** 20.x or higher
- **Yarn** package manager
- **ffmpeg** 4.x or higher

### Installation

```bash
# Clone repository
git clone https://github.com/yourusername/straimer.git
cd straimer

# Install dependencies
yarn install

# Configure environment
cp backend/.env.example backend/.env
# Edit backend/.env with your settings

# Create audio library
mkdir -p backend/data
cp backend/data/audio-library.example.json backend/data/audio-library.json
# Edit audio-library.json with your audio files
```

### Development

```bash
# Start development server (with hot reload)
yarn dev:backend

# The server will start at http://localhost:3000
```

### Testing

```bash
# Check server health
curl http://localhost:3000/health

# Run ffmpeg integration test
yarn workspace backend test:ffmpeg

# Run API integration tests
cd backend
./tests/test-api.sh
```

### Building for Production

```bash
# Build TypeScript to JavaScript
yarn build:backend

# Run production server
yarn start:backend
```

## Project Structure

```
straimer/
├── backend/                    # Node.js backend server
│   ├── src/
│   │   ├── config/            # Configuration & constants
│   │   ├── middleware/        # Express middleware
│   │   ├── routes/            # API & streaming routes
│   │   ├── services/          # Core business logic
│   │   ├── models/            # TypeScript types
│   │   ├── utils/             # Utilities & helpers
│   │   └── index.ts           # Application entry point
│   ├── tests/                 # Integration tests
│   ├── data/                  # Audio library JSON (gitignored)
│   └── dist/                  # Compiled JavaScript (gitignored)
├── frontend/                  # Mobile client (placeholder)
├── DEPLOYMENT.md              # Production deployment guide
├── PLAN.md                    # Implementation plan
└── CLAUDE.md                  # Developer guidance
```

## API Usage

### Authentication

All API and streaming endpoints require Bearer token authentication:

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost:3000/api/library
```

### Create Streaming Session

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -X POST http://localhost:3000/api/sessions \
  -d '{"audioFileId": "test-001"}'
```

**Response:**
```json
{
  "sessionId": "sess_abc123-def456...",
  "masterPlaylistUrl": "/stream/sess_abc123.../master.m3u8",
  "status": "initializing",
  "createdAt": "2026-01-08T..."
}
```

### Stream Audio

Once the session is `ready`, use the master playlist URL:

```
http://localhost:3000/stream/sess_abc123.../master.m3u8
```

This URL can be played in:
- **VLC Media Player**
- **Safari** (native HLS support)
- **HLS.js** (web players)
- **Mobile apps** (AVPlayer on iOS, ExoPlayer on Android)

See [backend/tests/API-TEST.md](./backend/tests/API-TEST.md) for complete API documentation.

## Configuration

Key environment variables in `backend/.env`:

```bash
# Server
PORT=3000
NODE_ENV=development

# Security (CHANGE IN PRODUCTION!)
API_KEY=your-secret-api-key-here

# Paths
AUDIO_LIBRARY_PATH=./data/audio-library.json
AUDIO_FILES_ROOT=/media/audio

# Session Management
SESSION_IDLE_TIMEOUT_MS=300000      # 5 minutes
SESSION_CLEANUP_INTERVAL_MS=60000   # 1 minute

# Streaming Quality
HLS_SEGMENT_DURATION=10             # seconds
HLS_BITRATES=64,128,256,320         # kbps

# Logging
LOG_LEVEL=info                      # debug, info, warn, error
```

## Audio Library Format

Create `backend/data/audio-library.json`:

```json
{
  "files": [
    {
      "id": "unique-id-001",
      "title": "My Audio Title",
      "path": "/absolute/path/to/audio.mp3",
      "duration": 3600,
      "metadata": {
        "artist": "Artist Name",
        "album": "Album Name"
      }
    }
  ]
}
```

## Deployment

For production deployment to Raspberry Pi, see [DEPLOYMENT.md](./DEPLOYMENT.md).

**Quick deployment summary:**

1. Install Node.js, Yarn, and ffmpeg on Raspberry Pi
2. Clone repository to `/opt/straimer/app`
3. Build application: `yarn build:backend`
4. Create systemd service
5. Configure Nginx reverse proxy (optional)
6. Set up SSL with Let's Encrypt (recommended)

## Monitoring

### Health Endpoint

```bash
curl http://localhost:3000/health
```

**Response:**
```json
{
  "status": "ok",
  "uptime": 1234.56,
  "sessions": 2,
  "activeStreams": 1,
  "memory": {
    "rss": "123.45 MB",
    "heapUsed": "89.12 MB",
    "heapPercent": "72.3%"
  },
  "buffers": {
    "totalFiles": 42,
    "totalSize": "123.45 MB"
  }
}
```

### Logs

```bash
# Development logs (pretty-printed)
yarn dev:backend

# Production logs (JSON)
pm2 logs straimer

# Systemd logs
sudo journalctl -u straimer -f
```

## Performance

**Typical resource usage on Raspberry Pi 4 (4GB):**

- **Memory**: 200-500MB depending on active sessions
- **CPU**: 20-40% per active stream
- **Network**: ~256kbps per stream (highest quality)
- **Concurrent streams**: 5-10 recommended

## Troubleshooting

### Server won't start

```bash
# Check Node.js version
node --version  # Should be 20.x+

# Check if port is available
lsof -i :3000

# Check logs
yarn dev:backend
```

### ffmpeg errors

```bash
# Verify ffmpeg is installed
ffmpeg -version

# Test audio file manually
ffmpeg -i /path/to/audio.mp3 -t 10 -f null -

# Check file permissions
ls -la /path/to/audio/files/
```

### Sessions timing out

- Default idle timeout is 5 minutes
- Each segment request resets the timeout
- Adjust `SESSION_IDLE_TIMEOUT_MS` in `.env`

### High memory usage

- Check active sessions: `GET /api/sessions`
- Terminate idle sessions: `DELETE /api/sessions/:id`
- Restart server to clear all buffers
- Consider lowering bitrates or segment duration

## Documentation

- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Production deployment guide for Raspberry Pi
- **[PLAN.md](./PLAN.md)** - Detailed implementation plan and architecture
- **[CLAUDE.md](./CLAUDE.md)** - Developer guidance for Claude Code
- **[backend/tests/API-TEST.md](./backend/tests/API-TEST.md)** - Complete API reference
- **[backend/tests/README.md](./backend/tests/README.md)** - Testing guide

## Technology Stack

- **Runtime**: Node.js 20.x + TypeScript
- **Framework**: Express.js
- **Streaming**: ffmpeg + HLS protocol
- **Logging**: Pino (structured JSON logging)
- **Validation**: Joi
- **Package Manager**: Yarn (workspaces)

## Development

### Code Structure

- **Services**: Business logic (SessionManager, FfmpegManager, BufferStore, AudioLibrary)
- **Routes**: API endpoints (session, library, stream)
- **Middleware**: Authentication, error handling, logging
- **Models**: TypeScript interfaces and types
- **Utils**: Helper functions (cleanup, validation, memory monitoring)

### Code Quality

```bash
# Type checking
yarn workspace backend type-check

# Linting
yarn workspace backend lint

# Building
yarn build:backend
```

## Contributing

1. Follow TypeScript best practices
2. Use structured logging with Pino
3. Add error handling for all edge cases
4. Update documentation for new features
5. Test on Raspberry Pi before submitting

## License

ISC

## Support

- GitHub Issues: Report bugs and feature requests
- Documentation: See `/docs` directory
- Tests: Run `./backend/tests/test-api.sh` for examples

---

**Built with ❤️ for Raspberry Pi streaming**
