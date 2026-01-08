# Testing Guide

## Prerequisites

### Install ffmpeg

**macOS (with Homebrew):**
```bash
brew install ffmpeg
```

**Linux (Debian/Ubuntu):**
```bash
sudo apt-get update
sudo apt-get install ffmpeg
```

**Raspberry Pi:**
```bash
sudo apt-get update
sudo apt-get install ffmpeg
```

## Running Tests

### ffmpeg Integration Test

This test verifies that:
- ffmpeg spawns correctly
- HLS segments are generated
- Playlists are created
- Buffers are populated in memory
- Session lifecycle works

**Run the test:**
```bash
cd backend
yarn exec tsx tests/test-ffmpeg.ts
```

**Expected output:**
- Session created with ID
- ffmpeg process spawns
- Session transitions from INITIALIZING to READY
- Master playlist generated
- Variant playlists (64k, 128k, 256k, 320k) created
- Segments (.ts files) captured to buffer store
- Final stats show multiple files in memory

**Verify:**
1. Check that buffer store has files
2. Check that master.m3u8 exists and contains quality variants
3. Check that each quality level has playlist.m3u8 and segment files
4. Verify no errors in ffmpeg stderr
5. Confirm session terminates cleanly

## Manual Testing with Audio File

To test with your own audio file:

1. Add your audio file to the system (e.g., `/media/audio/test.mp3`)

2. Update `data/audio-library.json`:
```json
{
  "files": [
    {
      "id": "my-test",
      "title": "My Test Audio",
      "path": "/path/to/your/audio.mp3",
      "duration": 300
    }
  ]
}
```

3. Modify the test to use your file ID:
```typescript
const sessionId = await sessionManager.createSession('my-test');
```

4. Run the test as above

## Troubleshooting

### ffmpeg not found
- Ensure ffmpeg is installed and in PATH
- Check: `which ffmpeg` or `ffmpeg -version`

### Permission denied reading audio file
- Check file permissions: `ls -la /path/to/audio`
- Ensure the audio file path is correct in audio-library.json

### No segments generated
- Check ffmpeg stderr output in logs
- Verify audio file is valid: `ffmpeg -i /path/to/audio.mp3`
- Increase wait time in test

### High memory usage
- This is expected - all segments are kept in memory
- For long audio files, this can be several hundred MB
- Monitor with: `ps aux | grep node`
