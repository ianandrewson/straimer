# Straimer API Reference

Public-facing REST API endpoints for the Straimer backend.

## Quick Start

**Base URL**: `http://localhost:3000` (configurable via `PORT` env var)

**Authentication**: All endpoints except `/health` require Bearer token authentication.

```http
Authorization: Bearer YOUR_API_KEY
```

The API key is configured via the `API_KEY` environment variable in `backend/.env`.

---

## Endpoint Overview

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/health` | No | Health check and server stats |
| `GET` | `/api/library` | Yes | List all audio files |
| `GET` | `/api/library/:id` | Yes | Get specific audio file info |
| `POST` | `/api/library/reload` | Yes | Reload audio library from disk |
| `POST` | `/api/sessions` | Yes | Create new streaming session |
| `GET` | `/api/sessions` | Yes | List all active sessions |
| `GET` | `/api/sessions/:sessionId` | Yes | Get session status |
| `DELETE` | `/api/sessions/:sessionId` | Yes | Terminate session |
| `GET` | `/stream/:sessionId/master.m3u8` | Yes | HLS master playlist |
| `GET` | `/stream/:sessionId/:quality/playlist.m3u8` | Yes | HLS variant playlist |
| `GET` | `/stream/:sessionId/:quality/:segment` | Yes | HLS media segment |

---

## Health Check

### `GET /health`

Public endpoint for server health monitoring.

**Response** (200 OK):
```json
{
  "status": "ok",
  "timestamp": "2026-01-09T12:34:56.789Z",
  "uptime": 3600.5,
  "sessions": 2,
  "activeStreams": 1,
  "memory": {
    "rss": "145.2 MB",
    "heapUsed": "78.4 MB",
    "heapPercent": "54.2%"
  },
  "buffers": {
    "totalFiles": 15,
    "totalSize": "145.2 MB"
  }
}
```

---

## Library Endpoints

### `GET /api/library`

List all available audio files.

**Response** (200 OK):
```json
{
  "files": [
    {
      "id": "track-001",
      "title": "Song Title",
      "path": "/path/to/file.mp3",
      "duration": 245,
      "metadata": {
        "artist": "Artist Name",
        "album": "Album Name"
      }
    }
  ],
  "count": 1
}
```

**TypeScript Types**:
```typescript
interface AudioFile {
  id: string;
  title: string;
  path: string;
  duration: number;
  metadata?: {
    artist?: string;
    album?: string;
    [key: string]: string | undefined;
  };
}

interface LibraryResponse {
  files: AudioFile[];
  count: number;
}
```

---

### `GET /api/library/:id`

Get detailed information about a specific audio file.

**Parameters**:
- `id` (path): Audio file ID

**Response** (200 OK):
```json
{
  "id": "track-001",
  "title": "Song Title",
  "path": "/path/to/file.mp3",
  "duration": 245,
  "metadata": {
    "artist": "Artist Name",
    "album": "Album Name"
  }
}
```

**Response** (404 Not Found):
```json
{
  "error": "Not Found",
  "message": "Audio file not found: track-999"
}
```

---

### `POST /api/library/reload`

Reload the audio library from disk. Useful after adding new files.

**Response** (200 OK):
```json
{
  "message": "Library reloaded successfully",
  "count": 42
}
```

---

## Session Management

### `POST /api/sessions`

Create a new streaming session for an audio file.

**Request Body**:
```json
{
  "audioFileId": "track-001",
  "qualities": ["64k", "128k", "256k"]
}
```

**Request Schema**:
- `audioFileId` (required): ID of the audio file to stream
- `qualities` (optional): Array of bitrate qualities. Defaults to `["64k", "128k", "256k"]`

**Response** (201 Created):
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "masterPlaylistUrl": "/stream/550e8400-e29b-41d4-a716-446655440000/master.m3u8",
  "status": "INITIALIZING",
  "createdAt": "2026-01-09T12:34:56.789Z"
}
```

**Response** (400 Bad Request):
```json
{
  "error": "Validation Error",
  "message": "Audio file not found: invalid-id"
}
```

**TypeScript Types**:
```typescript
interface CreateSessionRequest {
  audioFileId: string;
  qualities?: string[];
}

interface CreateSessionResponse {
  sessionId: string;
  masterPlaylistUrl: string;
  status: SessionState;
  createdAt: string;
}

type SessionState =
  | "INITIALIZING"
  | "READY"
  | "ACTIVE"
  | "IDLE"
  | "TERMINATED";
```

**Session Lifecycle**:
1. `INITIALIZING`: ffmpeg process is starting, playlists not yet available
2. `READY`: First segments available, ready to stream
3. `ACTIVE`: Currently streaming (playlist accessed recently)
4. `IDLE`: No recent access, will terminate after timeout (default: 5 min)
5. `TERMINATED`: Session ended, resources cleaned up

---

### `GET /api/sessions`

List all active sessions with statistics.

**Response** (200 OK):
```json
{
  "sessions": [
    {
      "sessionId": "550e8400-e29b-41d4-a716-446655440000",
      "audioFileId": "track-001",
      "status": "ACTIVE",
      "createdAt": "2026-01-09T12:30:00.000Z",
      "lastAccessedAt": "2026-01-09T12:35:00.000Z",
      "expiresAt": "2026-01-09T12:40:00.000Z"
    }
  ],
  "stats": {
    "sessionCount": 1,
    "activeCount": 1,
    "idleCount": 0,
    "bufferStats": {
      "totalFiles": 15,
      "totalSizeBytes": 1048576,
      "sessionCount": 1
    }
  }
}
```

**TypeScript Types**:
```typescript
interface SessionInfo {
  sessionId: string;
  audioFileId: string;
  status: SessionState;
  createdAt: string;
  lastAccessedAt: string;
  expiresAt: string;
}

interface SessionStats {
  sessionCount: number;
  activeCount: number;
  idleCount: number;
  bufferStats: {
    totalFiles: number;
    totalSizeBytes: number;
    sessionCount: number;
  };
}

interface ListSessionsResponse {
  sessions: SessionInfo[];
  stats: SessionStats;
}
```

---

### `GET /api/sessions/:sessionId`

Get detailed status of a specific session.

**Parameters**:
- `sessionId` (path): Session UUID

**Response** (200 OK):
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "audioFileId": "track-001",
  "status": "ACTIVE",
  "createdAt": "2026-01-09T12:30:00.000Z",
  "lastAccessedAt": "2026-01-09T12:35:00.000Z",
  "expiresAt": "2026-01-09T12:40:00.000Z"
}
```

**Response** (404 Not Found):
```json
{
  "error": "Not Found",
  "message": "Session not found: invalid-session-id"
}
```

---

### `DELETE /api/sessions/:sessionId`

Manually terminate a streaming session.

**Parameters**:
- `sessionId` (path): Session UUID

**Response** (200 OK):
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "terminated"
}
```

**Response** (404 Not Found):
```json
{
  "error": "Not Found",
  "message": "Session not found: invalid-session-id"
}
```

---

## HLS Streaming

These endpoints serve HLS (HTTP Live Streaming) content. Use with native HTML5 `<video>` or `<audio>` players, or HLS.js for broader browser support.

### `GET /stream/:sessionId/master.m3u8`

Get the HLS master playlist (adaptive bitrate index).

**Parameters**:
- `sessionId` (path): Session UUID

**Response** (200 OK):
```http
Content-Type: application/vnd.apple.mpegurl
Cache-Control: no-cache

#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=64000
64k/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=128000
128k/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=256000
256k/playlist.m3u8
```

**Response** (404 Not Found - Session Initializing):
```json
{
  "error": "Not Ready",
  "message": "Session is still initializing, please retry in a moment",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "INITIALIZING"
}
```

**Notes**:
- Automatically updates session's `lastAccessedAt` timestamp
- Sessions transition from `IDLE` to `ACTIVE` when accessed

---

### `GET /stream/:sessionId/:quality/playlist.m3u8`

Get the HLS variant playlist for a specific quality level.

**Parameters**:
- `sessionId` (path): Session UUID
- `quality` (path): Bitrate quality (`64k`, `128k`, `256k`)

**Response** (200 OK):
```http
Content-Type: application/vnd.apple.mpegurl
Cache-Control: no-cache

#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXTINF:10.0,
segment_000.ts
#EXTINF:10.0,
segment_001.ts
#EXT-X-ENDLIST
```

---

### `GET /stream/:sessionId/:quality/:segment`

Get a specific HLS media segment.

**Parameters**:
- `sessionId` (path): Session UUID
- `quality` (path): Bitrate quality
- `segment` (path): Segment filename (e.g., `segment_000.ts`)

**Response** (200 OK):
```http
Content-Type: video/MP2T
Cache-Control: public, max-age=31536000, immutable

[Binary MPEG-TS data]
```

**Notes**:
- Segments are immutable and heavily cached (1 year)
- Segments are served from memory (no disk I/O)

---

## Error Responses

All error responses follow this format:

```json
{
  "error": "Error Type",
  "message": "Detailed error message"
}
```

**Common HTTP Status Codes**:
- `200 OK`: Request succeeded
- `201 Created`: Resource created successfully
- `400 Bad Request`: Invalid request data or validation error
- `401 Unauthorized`: Missing or invalid API key
- `404 Not Found`: Resource doesn't exist
- `500 Internal Server Error`: Server error (check logs)

**Authentication Errors** (401):
```json
{
  "error": "Unauthorized",
  "message": "Missing authorization header"
}
```

**Validation Errors** (400):
```json
{
  "error": "Validation Error",
  "message": "audioFileId is required"
}
```

---

## Usage Examples

### Basic Playback Flow

```typescript
// 1. Get library
const library = await fetch('/api/library', {
  headers: { 'Authorization': `Bearer ${apiKey}` }
}).then(r => r.json());

// 2. Create session
const session = await fetch('/api/sessions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    audioFileId: library.files[0].id,
    qualities: ['64k', '128k', '256k']
  })
}).then(r => r.json());

// 3. Wait for session to be ready
let status = 'INITIALIZING';
while (status === 'INITIALIZING') {
  await new Promise(resolve => setTimeout(resolve, 500));
  const info = await fetch(`/api/sessions/${session.sessionId}`, {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  }).then(r => r.json());
  status = info.status;
}

// 4. Play stream
const audio = new Audio();
audio.src = session.masterPlaylistUrl;
audio.play();

// 5. Clean up when done
await fetch(`/api/sessions/${session.sessionId}`, {
  method: 'DELETE',
  headers: { 'Authorization': `Bearer ${apiKey}` }
});
```

### Using HLS.js (for broader browser support)

```typescript
import Hls from 'hls.js';

const video = document.querySelector('video');
const hls = new Hls({
  xhrSetup: (xhr) => {
    xhr.setRequestHeader('Authorization', `Bearer ${apiKey}`);
  }
});

hls.loadSource(session.masterPlaylistUrl);
hls.attachMedia(video);
hls.on(Hls.Events.MANIFEST_PARSED, () => {
  video.play();
});
```

---

## Rate Limits & Constraints

- **Session Limit**: No hard limit, but sessions auto-terminate after 5 minutes of inactivity
- **Concurrent Sessions**: Limited by available memory (~10-20 sessions typical on Raspberry Pi)
- **File Size**: No explicit limit, but large files consume more memory
- **Session Timeout**: Configurable via `SESSION_IDLE_TIMEOUT_MS` env var (default: 300000ms / 5 min)

---

## Notes for Frontend Development

1. **Session Initialization**: Always poll `GET /api/sessions/:sessionId` until status is `READY` before attempting to play
2. **Error Handling**: Handle 404 responses on stream endpoints (session may have timed out)
3. **Session Management**: Store `sessionId` and clean up with `DELETE` when user stops playback
4. **Quality Selection**: Master playlist enables adaptive bitrate. Consider allowing manual quality selection for poor connections
5. **Mobile Optimization**: Default bitrates (64k/128k/256k) are optimized for cellular networks
6. **Authentication**: Include Bearer token in ALL requests except `/health`
7. **CORS**: Development mode allows all origins. Production mode disables CORS.

---

## Configuration Reference

Environment variables that affect API behavior:

- `PORT`: Server port (default: 3000)
- `API_KEY`: Required for all authenticated endpoints
- `SESSION_IDLE_TIMEOUT_MS`: Session auto-termination delay (default: 300000)
- `HLS_BITRATES`: Available quality levels (default: "64,128,256")
- `NODE_ENV`: `development` enables CORS and verbose logging

See `backend/.env.example` for complete configuration options.
