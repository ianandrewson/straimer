# Straimer

Media streaming application for Raspberry Pi with HLS adaptive bitrate streaming.

## Project Structure

- `backend/` - Node.js Express server for HLS streaming
- `frontend/` - Mobile client (coming soon)

## Getting Started

### Prerequisites

- Node.js 20.x or higher
- Yarn package manager
- ffmpeg installed on your system

### Installation

```bash
# Install dependencies
yarn install

# Copy environment variables
cp backend/.env.example backend/.env
# Edit backend/.env with your configuration
```

### Development

```bash
# Run backend in development mode
yarn dev:backend

# Build backend
yarn build:backend

# Run backend in production mode
yarn start:backend
```

### Health Check

Once the server is running, verify it's working:

```bash
curl http://localhost:3000/health
```

## Documentation

- [PLAN.md](./PLAN.md) - Detailed implementation plan
- [CLAUDE.md](./CLAUDE.md) - Developer guidance for Claude Code

## License

ISC
