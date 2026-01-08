# API Testing Guide

## Prerequisites

1. **Start the server:**
   ```bash
   cd backend
   yarn dev
   ```

2. **Ensure ffmpeg is installed:**
   ```bash
   ffmpeg -version
   ```

3. **Verify audio library exists:**
   - Check that `backend/data/audio-library.json` exists
   - Ensure at least one audio file is listed and accessible

## Authentication

All API and streaming endpoints require Bearer token authentication:

```bash
Authorization: Bearer <API_KEY>
```

The API key is configured in `.env`:
```
API_KEY=test-api-key-development
```

## API Endpoints

### 1. Health Check (Public)

**GET /health**

No authentication required.

```bash
curl http://localhost:3000/health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-01-08T...",
  "uptime": 123.45,
  "sessions": 2,
  "activeStreams": 1
}
```

---

### 2. List Audio Library

**GET /api/library**

Requires authentication.

```bash
curl -H "Authorization: Bearer test-api-key-development" \
  http://localhost:3000/api/library
```

**Response:**
```json
{
  "files": [
    {
      "id": "test-001",
      "title": "Test Audio",
      "path": "/System/Library/Sounds/Funk.aiff",
      "duration": 1,
      "metadata": {
        "artist": "Apple",
        "album": "System Sounds"
      }
    }
  ],
  "count": 1
}
```

---

### 3. Get Audio File Info

**GET /api/library/:id**

```bash
curl -H "Authorization: Bearer test-api-key-development" \
  http://localhost:3000/api/library/test-001
```

---

### 4. Reload Audio Library

**POST /api/library/reload**

Reloads the audio library from disk.

```bash
curl -H "Authorization: Bearer test-api-key-development" \
  -X POST http://localhost:3000/api/library/reload
```

---

### 5. Create Session

**POST /api/sessions**

Creates a new streaming session.

```bash
curl -H "Authorization: Bearer test-api-key-development" \
  -H "Content-Type: application/json" \
  -X POST http://localhost:3000/api/sessions \
  -d '{"audioFileId": "test-001"}'
```

**Request Body:**
```json
{
  "audioFileId": "test-001",
  "qualities": ["64k", "128k", "256k"]  // Optional
}
```

**Response:**
```json
{
  "sessionId": "sess_abc123...",
  "masterPlaylistUrl": "/stream/sess_abc123.../master.m3u8",
  "status": "initializing",
  "createdAt": "2026-01-08T..."
}
```

---

### 6. Get Session Status

**GET /api/sessions/:sessionId**

```bash
curl -H "Authorization: Bearer test-api-key-development" \
  http://localhost:3000/api/sessions/sess_abc123...
```

**Response:**
```json
{
  "sessionId": "sess_abc123...",
  "audioFileId": "test-001",
  "status": "ready",
  "createdAt": "2026-01-08T...",
  "lastAccessedAt": "2026-01-08T...",
  "expiresAt": "2026-01-08T..."
}
```

**Session States:**
- `initializing` - ffmpeg starting up
- `ready` - ready for streaming
- `active` - currently streaming
- `idle` - no recent requests
- `terminated` - session ended

---

### 7. List All Sessions

**GET /api/sessions**

```bash
curl -H "Authorization: Bearer test-api-key-development" \
  http://localhost:3000/api/sessions
```

**Response:**
```json
{
  "sessions": [
    {
      "sessionId": "sess_abc123...",
      "audioFileId": "test-001",
      "status": "active",
      "createdAt": "...",
      "lastAccessedAt": "...",
      "expiresAt": "..."
    }
  ],
  "stats": {
    "sessionCount": 1,
    "activeCount": 1,
    "idleCount": 0,
    "bufferStats": {
      "sessionCount": 1,
      "totalFiles": 42,
      "totalBytes": 1234567
    }
  }
}
```

---

### 8. Delete Session

**DELETE /api/sessions/:sessionId**

```bash
curl -H "Authorization: Bearer test-api-key-development" \
  -X DELETE http://localhost:3000/api/sessions/sess_abc123...
```

**Response:**
```json
{
  "sessionId": "sess_abc123...",
  "status": "terminated"
}
```

---

## Streaming Endpoints

### 9. Get Master Playlist

**GET /stream/:sessionId/master.m3u8**

```bash
curl -H "Authorization: Bearer test-api-key-development" \
  http://localhost:3000/stream/sess_abc123.../master.m3u8
```

**Response:**
```
#EXTM3U
#EXT-X-VERSION:3

#EXT-X-STREAM-INF:BANDWIDTH=64000,CODECS="mp4a.40.2"
64k/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=128000,CODECS="mp4a.40.2"
128k/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=256000,CODECS="mp4a.40.2"
256k/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=320000,CODECS="mp4a.40.2"
320k/playlist.m3u8
```

---

### 10. Get Variant Playlist

**GET /stream/:sessionId/:quality/playlist.m3u8**

```bash
curl -H "Authorization: Bearer test-api-key-development" \
  http://localhost:3000/stream/sess_abc123.../64k/playlist.m3u8
```

**Response:**
```
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-PLAYLIST-TYPE:EVENT
#EXTINF:10.0,
segment0.ts
#EXTINF:10.0,
segment1.ts
...
```

---

### 11. Get Segment

**GET /stream/:sessionId/:quality/:segment**

```bash
curl -H "Authorization: Bearer test-api-key-development" \
  http://localhost:3000/stream/sess_abc123.../64k/segment0.ts \
  -o segment0.ts
```

Returns binary MPEG-TS segment data.

---

## Testing with VLC or Safari

Once you have a session created:

```bash
# Create session and capture session ID
RESPONSE=$(curl -s -H "Authorization: Bearer test-api-key-development" \
  -H "Content-Type: application/json" \
  -X POST http://localhost:3000/api/sessions \
  -d '{"audioFileId": "test-001"}')

SESSION_ID=$(echo $RESPONSE | jq -r '.sessionId')

# Wait for segments to generate
sleep 5

# Open in VLC (add auth header support first, or use proxy)
echo "Master playlist URL:"
echo "http://localhost:3000/stream/$SESSION_ID/master.m3u8"
```

**Note:** VLC and Safari cannot send custom headers, so you'll need to either:
1. Temporarily disable auth for testing
2. Use a proxy that adds the auth header
3. Add token as a query parameter (requires code modification)

---

## Automated Test Script

Run the automated test script:

```bash
cd backend
./tests/test-api.sh
```

This script tests all endpoints in sequence.

---

## Error Responses

### 400 Bad Request
```json
{
  "error": "Validation Error",
  "message": "Invalid request: ..."
}
```

### 401 Unauthorized
```json
{
  "error": "Unauthorized",
  "message": "Missing or invalid authorization header"
}
```

### 404 Not Found
```json
{
  "error": "Not Found",
  "message": "Session not found: sess_..."
}
```

### 404 Not Ready
```json
{
  "error": "Not Ready",
  "message": "Session is still initializing, please retry in a moment",
  "sessionId": "sess_...",
  "status": "initializing"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal Server Error",
  "message": "An unexpected error occurred"
}
```

---

## Common Issues

### "Session not found"
- Session may have expired (5 minute idle timeout)
- Session ID is invalid
- Session was manually deleted

### "Session is still initializing"
- Wait 2-3 seconds after creating session
- Check if ffmpeg is running: `ps aux | grep ffmpeg`
- Check server logs for ffmpeg errors

### "Segment not found"
- Segment may not be generated yet (try a few seconds later)
- ffmpeg may have crashed (check logs)
- Session may have terminated

### "Unauthorized"
- Missing Authorization header
- Invalid API key
- API_KEY not set in .env

---

## Performance Testing

Test multiple concurrent sessions:

```bash
for i in {1..5}; do
  curl -s -H "Authorization: Bearer test-api-key-development" \
    -H "Content-Type: application/json" \
    -X POST http://localhost:3000/api/sessions \
    -d '{"audioFileId": "test-001"}' &
done
wait

# Check stats
curl -s -H "Authorization: Bearer test-api-key-development" \
  http://localhost:3000/api/sessions | jq '.stats'
```
