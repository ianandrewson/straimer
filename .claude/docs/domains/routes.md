# Routes Domain

**Path**: `backend/src/routes/`
**Purpose**: API endpoint handlers and route registration
**Confidence**: High

---

## Overview

The Routes domain defines all HTTP endpoints for the Straimer API. It includes session management (CRUD), audio library listing, and HLS streaming endpoints. All routes (except `/health`) require bearer token authentication.

---

## Files

### `index.ts`
**Purpose**: Root router that aggregates all route modules

**Exports**:
- `createRouter(sessionManager, bufferStore, audioLibrary)` - Factory function returning configured Express router

**Structure**:
```typescript
export function createRouter(
  sessionManager: SessionManager,
  bufferStore: BufferStore,
  audioLibrary: AudioLibrary
): express.Router {
  const router = express.Router();

  // Apply authentication to all API routes
  router.use('/api', authMiddleware);
  router.use('/stream', authMiddleware);

  // Register sub-routers
  router.use('/api', createLibraryRouter(audioLibrary));
  router.use('/api', createSessionRouter(sessionManager));
  router.use('/stream', createStreamRouter(sessionManager, bufferStore));

  return router;
}
```

**Dependency Injection**: Services passed as parameters for testability and flexibility.

**Location**: `/Users/ianandrewson/coding/projects/straimer/backend/src/routes/index.ts`

---

### `library.ts`
**Purpose**: Audio library listing endpoint

**Endpoints**:

#### `GET /api/library`
**Description**: List all audio files in the library
**Authentication**: Required (Bearer token)
**Query Parameters**: None
**Response**: 200 OK
```json
{
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
  ],
  "count": 1
}
```

**Error Responses**:
- 401 Unauthorized - Invalid or missing API key
- 500 Internal Server Error - Library loading failed

**Implementation**:
```typescript
router.get('/library', (req, res) => {
  const files = audioLibrary.getAll();
  res.status(HTTP_STATUS.OK).json({
    files,
    count: files.length,
  });
});
```

**Location**: `/Users/ianandrewson/coding/projects/straimer/backend/src/routes/library.ts`

---

### `session.ts`
**Purpose**: Session lifecycle management endpoints

**Endpoints**:

#### `POST /api/sessions`
**Description**: Create a new streaming session
**Authentication**: Required (Bearer token)
**Request Body**:
```json
{
  "audioFileId": "audio-001",
  "qualities": ["64k", "128k", "256k"]  // Optional, defaults to config.HLS_BITRATES
}
```

**Response**: 201 Created
```json
{
  "sessionId": "sess_550e8400-e29b-41d4-a716-446655440000",
  "audioFileId": "audio-001",
  "status": "INITIALIZING",
  "createdAt": "2026-01-09T12:00:00.000Z",
  "lastAccessedAt": "2026-01-09T12:00:00.000Z",
  "expiresAt": "2026-01-09T12:05:00.000Z"
}
```

**Error Responses**:
- 400 Bad Request - Invalid request body or audio file not found
- 401 Unauthorized - Invalid or missing API key
- 500 Internal Server Error - Session creation failed

**Validation**:
```typescript
const schema = Joi.object({
  audioFileId: Joi.string().required(),
  qualities: Joi.array().items(Joi.string()).optional(),
});
```

---

#### `GET /api/sessions`
**Description**: List all active sessions
**Authentication**: Required (Bearer token)
**Response**: 200 OK
```json
{
  "sessions": [
    {
      "sessionId": "sess_123",
      "audioFileId": "audio-001",
      "status": "ACTIVE",
      "createdAt": "2026-01-09T12:00:00.000Z",
      "lastAccessedAt": "2026-01-09T12:01:00.000Z",
      "expiresAt": "2026-01-09T12:06:00.000Z"
    }
  ],
  "count": 1
}
```

---

#### `GET /api/sessions/:sessionId`
**Description**: Get details for a specific session
**Authentication**: Required (Bearer token)
**URL Parameters**:
- `sessionId` - Session identifier

**Response**: 200 OK
```json
{
  "sessionId": "sess_123",
  "audioFileId": "audio-001",
  "status": "ACTIVE",
  "createdAt": "2026-01-09T12:00:00.000Z",
  "lastAccessedAt": "2026-01-09T12:01:00.000Z",
  "expiresAt": "2026-01-09T12:06:00.000Z"
}
```

**Error Responses**:
- 404 Not Found - Session does not exist

---

#### `DELETE /api/sessions/:sessionId`
**Description**: Terminate a session and cleanup resources
**Authentication**: Required (Bearer token)
**URL Parameters**:
- `sessionId` - Session identifier

**Response**: 200 OK
```json
{
  "message": "Session terminated",
  "sessionId": "sess_123"
}
```

**Error Responses**:
- 404 Not Found - Session does not exist

**Location**: `/Users/ianandrewson/coding/projects/straimer/backend/src/routes/session.ts`

---

### `stream.ts`
**Purpose**: HLS streaming content delivery

**Endpoints**:

#### `GET /stream/:sessionId/master.m3u8`
**Description**: Get HLS master playlist
**Authentication**: Required (Bearer token)
**URL Parameters**:
- `sessionId` - Session identifier

**Response**: 200 OK (Content-Type: application/vnd.apple.mpegurl)
```m3u8
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=64000
64k/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=128000
128k/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=256000
256k/playlist.m3u8
```

**Error Responses**:
- 404 Not Found - Session does not exist
- 503 Service Unavailable - Session not ready (still initializing)

**Side Effects**: Updates session `lastAccessedAt` timestamp

---

#### `GET /stream/:sessionId/:quality/playlist.m3u8`
**Description**: Get HLS variant playlist for specific quality
**Authentication**: Required (Bearer token)
**URL Parameters**:
- `sessionId` - Session identifier
- `quality` - Quality level (e.g., '64k', '128k', '256k')

**Response**: 200 OK (Content-Type: application/vnd.apple.mpegurl)
```m3u8
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXTINF:10.0,
segment-0.ts
#EXTINF:10.0,
segment-1.ts
#EXT-X-ENDLIST
```

**Error Responses**:
- 404 Not Found - Session or playlist not found
- 503 Service Unavailable - Playlist not ready yet

---

#### `GET /stream/:sessionId/:quality/:segment`
**Description**: Get HLS media segment
**Authentication**: Required (Bearer token)
**URL Parameters**:
- `sessionId` - Session identifier
- `quality` - Quality level (e.g., '64k', '128k', '256k')
- `segment` - Segment filename (e.g., 'segment-0.ts')

**Response**: 200 OK (Content-Type: video/mp2t)
- Binary MPEG-TS segment data

**Error Responses**:
- 404 Not Found - Segment not found or not ready yet
- 503 Service Unavailable - ffmpeg still generating segment

**Retry Logic**: Clients should retry 404 responses with exponential backoff (segment may still be generating)

**Location**: `/Users/ianandrewson/coding/projects/straimer/backend/src/routes/stream.ts`

---

## Route Organization

### Grouping Strategy
- `/api/*` - REST API endpoints (JSON responses)
- `/stream/*` - Streaming endpoints (HLS content)
- `/health` - Public health check (no auth)

### Authentication
All routes under `/api` and `/stream` protected by `authMiddleware` applied in `index.ts`.

### Error Handling
Routes use try-catch with async handlers. Unhandled errors caught by global `errorHandler` middleware.

---

## Request Validation

### Validation Strategy
Uses Joi for request body validation:

```typescript
import { validateRequest } from '../utils/validation';

const createSessionSchema = Joi.object({
  audioFileId: Joi.string().required(),
  qualities: Joi.array().items(Joi.string()).optional(),
});

router.post('/sessions', (req, res) => {
  const { error, value } = validateRequest(req.body, createSessionSchema);
  if (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: error.message });
  }
  // Proceed with validated data
});
```

### Validation Schemas
Defined inline in route handlers or extracted to separate file if reused.

---

## Response Formats

### Success Responses
All successful responses include appropriate HTTP status code and JSON body:
- 200 OK - Retrieval or update successful
- 201 Created - Resource created
- 204 No Content - Deletion successful (alternative to 200)

### Error Responses
Standard error format:
```json
{
  "error": "Error message",
  "details": "Additional context (optional)"
}
```

### Content Types
- JSON endpoints: `Content-Type: application/json`
- HLS playlists: `Content-Type: application/vnd.apple.mpegurl`
- HLS segments: `Content-Type: video/mp2t`

---

## Session Access Tracking

### Last Accessed Update
Stream routes update `session.lastAccessedAt` on every request:

```typescript
router.get('/stream/:sessionId/master.m3u8', (req, res) => {
  const { sessionId } = req.params;
  sessionManager.updateLastAccessed(sessionId); // Reset idle timer
  // ... serve content
});
```

### Idle Timeout
- Sessions timeout after `config.SESSION_IDLE_TIMEOUT` ms of inactivity
- Access tracking prevents premature termination
- Timeout resets on every stream request

---

## Streaming Flow

### Client Workflow
1. **Authenticate**: Include `Authorization: Bearer <token>` in all requests
2. **List Library**: `GET /api/library` to discover audio files
3. **Create Session**: `POST /api/sessions` with `audioFileId`
4. **Get Master Playlist**: `GET /stream/:sessionId/master.m3u8`
5. **Select Quality**: Client chooses bitrate based on network conditions
6. **Get Variant Playlist**: `GET /stream/:sessionId/:quality/playlist.m3u8`
7. **Fetch Segments**: `GET /stream/:sessionId/:quality/segment-N.ts`
8. **Cleanup**: `DELETE /api/sessions/:sessionId` (optional, auto-cleanup after timeout)

### HLS Client Behavior
- Clients follow HLS protocol (RFC 8216)
- Fetch segments sequentially based on playlist
- Handle 404 with retry (segment may still be generating)
- Switch quality levels by fetching different variant playlists

---

## Performance Considerations

### Caching Headers
Consider adding cache headers for HLS content:
```typescript
res.set('Cache-Control', 'no-cache'); // Playlists (dynamic)
res.set('Cache-Control', 'public, max-age=3600'); // Segments (immutable)
```

### Content-Length
Buffer store includes content length in response for better client streaming.

### Range Requests
Currently not supported. Consider implementing HTTP range requests for seeking.

---

## Testing Routes

### Unit Testing
```typescript
import request from 'supertest';
import { app } from './app';

describe('POST /api/sessions', () => {
  it('creates session with valid audio file', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ audioFileId: 'audio-001' });

    expect(response.status).toBe(201);
    expect(response.body.sessionId).toBeDefined();
  });

  it('returns 401 without auth', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .send({ audioFileId: 'audio-001' });

    expect(response.status).toBe(401);
  });
});
```

### Integration Testing
Test full streaming flow:
1. Create session
2. Wait for READY state
3. Fetch master playlist
4. Fetch variant playlist
5. Fetch segments
6. Verify content integrity

---

## Common Issues

**Issue**: 503 Service Unavailable when accessing stream
- **Cause**: Session still in INITIALIZING state (ffmpeg starting)
- **Solution**: Wait 2-3 seconds after session creation before accessing stream

**Issue**: 404 Not Found for segments
- **Cause**: ffmpeg still generating segment, or segment already removed from buffer
- **Solution**: Implement retry logic in client, reduce HLS segment duration

**Issue**: Sessions not cleaning up
- **Cause**: Client continuously accessing stream (resetting idle timer)
- **Solution**: Implement explicit DELETE endpoint call in client

**Issue**: High memory usage
- **Cause**: Too many active sessions, segments not clearing
- **Solution**: Reduce SESSION_IDLE_TIMEOUT, limit concurrent sessions

---

## Future Enhancements

- [ ] Add pagination to `/api/library` and `/api/sessions`
- [ ] Add filtering/search to `/api/library` (by title, artist, album)
- [ ] Add `/api/sessions/:sessionId/stats` for streaming metrics
- [ ] Implement HTTP range requests for seeking
- [ ] Add caching headers for HLS content
- [ ] Add WebSocket endpoint for real-time session updates
- [ ] Add `/api/sessions/:sessionId/extend` to reset timeout without streaming

---

## Dependencies

- **express** (^4.18.2) - Web framework
- **joi** (^17.12.0) - Request validation

---

**Location**: `/Users/ianandrewson/coding/projects/straimer/backend/src/routes/`
**Key Files**: `index.ts`, `library.ts`, `session.ts`, `stream.ts`
