# Multi-Bitrate Transcoding Pattern

**Category**: Performance Optimization
**Confidence**: High
**Location**: `backend/src/services/FfmpegManager.ts`

---

## Overview

The Multi-Bitrate Transcoding pattern uses a single ffmpeg process to generate multiple bitrate variants simultaneously. This approach maximizes CPU efficiency on resource-constrained devices like Raspberry Pi by sharing decoding overhead across all outputs.

---

## Architecture

```
                    ┌──────────────┐
                    │ Input Audio  │
                    │   (Source)   │
                    └───────┬──────┘
                            │
                            v
                    ┌──────────────┐
                    │    ffmpeg    │
                    │   (decode)   │
                    └───────┬──────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
              v             v             v
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │ AAC Encoder  │ │ AAC Encoder  │ │ AAC Encoder  │
    │   64 kbps    │ │  128 kbps    │ │  256 kbps    │
    └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
           │                │                │
           v                v                v
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │ HLS Muxer    │ │ HLS Muxer    │ │ HLS Muxer    │
    │   (64k/)     │ │   (128k/)    │ │   (256k/)    │
    └──────────────┘ └──────────────┘ └──────────────┘
```

**Key Insight**: Decode once, encode multiple times in parallel.

---

## Implementation

### ffmpeg Command Construction

```typescript
private buildFfmpegArgs(
  inputPath: string,
  qualities: string[],
  bitrates: number[],
  outputDir: string
): string[] {
  const args: string[] = [
    '-i', inputPath,           // Input file
    '-preset', 'ultrafast',    // Fastest encoding
    '-threads', '2',           // Limit CPU usage
  ];

  // Add output for each quality level
  for (let i = 0; i < qualities.length; i++) {
    const quality = qualities[i];
    const bitrate = bitrates[i];

    args.push(
      // Map audio stream
      '-map', '0:a',

      // Audio encoding
      '-c:a', 'aac',
      '-b:a', `${bitrate}k`,
      '-ac', '2',              // Stereo
      '-ar', '44100',          // Sample rate

      // HLS output
      '-f', 'hls',
      '-hls_time', config.HLS_SEGMENT_DURATION.toString(),
      '-hls_list_size', '0',   // Keep all segments in playlist
      '-hls_segment_filename', `${outputDir}/${quality}/segment-%03d.ts`,

      // Output playlist path
      `${outputDir}/${quality}/playlist.m3u8`
    );
  }

  return args;
}
```

### Example Command

For 3 bitrates (64k, 128k, 256k):

```bash
ffmpeg -i /media/audio/track.mp3 \
  -preset ultrafast \
  -threads 2 \
  \
  -map 0:a -c:a aac -b:a 64k -ac 2 -ar 44100 \
  -f hls -hls_time 10 -hls_list_size 0 \
  -hls_segment_filename /tmp/straimer-sess_123/64k/segment-%03d.ts \
  /tmp/straimer-sess_123/64k/playlist.m3u8 \
  \
  -map 0:a -c:a aac -b:a 128k -ac 2 -ar 44100 \
  -f hls -hls_time 10 -hls_list_size 0 \
  -hls_segment_filename /tmp/straimer-sess_123/128k/segment-%03d.ts \
  /tmp/straimer-sess_123/128k/playlist.m3u8 \
  \
  -map 0:a -c:a aac -b:a 256k -ac 2 -ar 44100 \
  -f hls -hls_time 10 -hls_list_size 0 \
  -hls_segment_filename /tmp/straimer-sess_123/256k/segment-%03d.ts \
  /tmp/straimer-sess_123/256k/playlist.m3u8
```

---

## Benefits

### 1. CPU Efficiency

**Single Process Approach** (Current):
```
CPU Usage = Decode + (Encode × 3)
          = 10% + (10% × 3)
          = 40%
```

**Multi-Process Approach** (Alternative):
```
CPU Usage = (Decode + Encode) × 3
          = (10% + 10%) × 3
          = 60%
```

**Savings**: ~33% reduction in CPU usage

**Explanation**: Audio decoding happens once and is shared across all encoders, rather than decoding 3 times independently.

---

### 2. Memory Efficiency

**Single Process**:
- 1 ffmpeg instance
- 1 input buffer
- 3 output buffers
- Memory: ~50-100MB

**Multi-Process**:
- 3 ffmpeg instances
- 3 input buffers
- 3 output buffers
- Memory: ~150-300MB

**Savings**: ~50-66% reduction in memory usage

---

### 3. Simplified Management

**Single Process**:
- 1 PID to track
- 1 process to kill
- Synchronized output (all qualities at same position)

**Multi-Process**:
- 3 PIDs to track
- 3 processes to kill
- Potential desync issues

---

## Trade-offs

### All-or-Nothing Failure

**Risk**: If ffmpeg crashes, all qualities lost simultaneously.

**Mitigation**:
- Monitor ffmpeg stderr for errors
- Restart session automatically on failure (future enhancement)
- Use stable ffmpeg version

```typescript
ffmpegProcess.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    logger.error({ sessionId, exitCode: code }, 'ffmpeg exited with error');
    this.terminateSession(sessionId); // Clean up and notify client
  }
});
```

---

### No Per-Quality Control

**Limitation**: Cannot pause/resume individual qualities.

**Impact**: Minimal - clients switch qualities by fetching different playlists, not by pausing encoders.

---

### Fixed Quality Levels

**Limitation**: Quality levels set at session creation.

**Workaround**: Client can create multiple sessions if different quality sets needed.

---

## Configuration

### Bitrate Selection

Default: 64, 128, 256 kbps

```env
HLS_BITRATES=64,128,256
```

**Tuning Recommendations**:

| Network | Bitrates | Use Case |
|---------|----------|----------|
| Cellular (3G) | 32,64,128 | Low bandwidth |
| Cellular (4G/5G) | 64,128,256 | Balanced (default) |
| WiFi | 128,256,320 | High quality |
| Localhost | 320,512,1024 | Testing/LAN |

---

### Encoding Preset

Default: `ultrafast`

```typescript
'-preset', 'ultrafast',
```

**Preset Options**:
- `ultrafast` - Fastest, lower compression (recommended for RPi)
- `veryfast` - Fast, better compression
- `medium` - Balanced (too slow for RPi)
- `slow` - Best compression (not viable for real-time)

**Performance Impact**:

| Preset | CPU Usage | Compression | Streaming Latency |
|--------|-----------|-------------|-------------------|
| ultrafast | 40% | Low | <2s |
| veryfast | 60% | Medium | 2-3s |
| medium | 90%+ | High | 5-10s |

---

### Thread Limit

Default: 2 threads

```typescript
'-threads', '2',
```

**Tuning**:
- Raspberry Pi 4 (4 cores): 2 threads (leave room for Node.js)
- Higher-end devices: 4 threads
- Testing: 0 (auto, uses all cores)

---

### Segment Duration

Default: 10 seconds

```env
HLS_SEGMENT_DURATION=10
```

**Trade-offs**:

| Duration | Latency | Quality Switching | Bandwidth |
|----------|---------|-------------------|-----------|
| 2s | Low (~4s) | Frequent | Higher overhead |
| 6s | Medium (~12s) | Balanced | Medium |
| 10s | High (~20s) | Infrequent | Low overhead (default) |

**Recommendation**: 10 seconds for Raspberry Pi (reduces CPU load from frequent segmentation).

---

## HLS Output Configuration

### Segment Naming

```
/tmp/straimer-<sessionId>/<quality>/segment-%03d.ts
```

Examples:
- `64k/segment-000.ts`
- `64k/segment-001.ts`
- `128k/segment-000.ts`

**Format**: Zero-padded 3-digit counter (000-999)

---

### Playlist Options

```typescript
'-hls_list_size', '0',   // Keep all segments (live + VOD)
'-hls_flags', 'independent_segments',  // Each segment independently decodable
```

**Playlist Type**: Live + VOD (full playlist retained for seeking)

**Alternative**: Set `-hls_list_size 5` for sliding window (only last 5 segments in playlist)

---

## Adaptive Bitrate Streaming

### Master Playlist

Generated by BufferStore:

```m3u8
#EXTM3U
#EXT-X-VERSION:3

#EXT-X-STREAM-INF:BANDWIDTH=64000,CODECS="mp4a.40.2"
64k/playlist.m3u8

#EXT-X-STREAM-INF:BANDWIDTH=128000,CODECS="mp4a.40.2"
128k/playlist.m3u8

#EXT-X-STREAM-INF:BANDWIDTH=256000,CODECS="mp4a.40.2"
256k/playlist.m3u8
```

**Client Behavior**:
1. Fetch master playlist
2. Measure network bandwidth
3. Select appropriate quality variant
4. Fetch variant playlist
5. Stream segments
6. Monitor buffer and switch qualities as needed

---

### Variant Playlists

Example `128k/playlist.m3u8`:

```m3u8
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0

#EXTINF:10.0,
segment-000.ts
#EXTINF:10.0,
segment-001.ts
#EXTINF:10.0,
segment-002.ts
#EXT-X-ENDLIST
```

**Key Fields**:
- `TARGETDURATION`: Maximum segment duration
- `MEDIA-SEQUENCE`: Starting sequence number
- `EXTINF`: Segment duration
- `ENDLIST`: Indicates VOD (not live-only)

---

## Performance Monitoring

### CPU Usage

```bash
# Monitor ffmpeg CPU usage
top -p $(pgrep ffmpeg)

# Expected: 20-40% per session on Raspberry Pi 4
```

### Memory Usage

```bash
# Monitor ffmpeg memory
ps aux | grep ffmpeg

# Expected: 50-100MB per session
```

### Health Endpoint

```bash
curl http://localhost:3000/health
```

```json
{
  "status": "ok",
  "sessions": 3,
  "activeStreams": 2,
  "memory": {
    "rss": "450 MB",
    "heapUsed": "350 MB"
  }
}
```

---

## Error Handling

### ffmpeg Spawn Failure

```typescript
try {
  const ffmpegProcess = spawn('ffmpeg', args);
} catch (error) {
  logger.error({ sessionId, error }, 'Failed to spawn ffmpeg');
  throw new Error('ffmpeg not found or failed to start');
}
```

**Common Causes**:
- ffmpeg not installed
- ffmpeg not in PATH
- Input file not readable
- Output directory not writable

---

### Encoding Errors

```typescript
ffmpegProcess.stderr?.on('data', (data) => {
  const message = data.toString();

  // Detect errors
  if (message.includes('Error') || message.includes('Invalid')) {
    logger.error({ sessionId, message }, 'ffmpeg encoding error');
  }

  // Log progress
  logger.debug({ sessionId, message }, 'ffmpeg stderr');
});
```

**Common Errors**:
- Unsupported audio codec
- Corrupted input file
- Insufficient CPU/memory

---

## Testing

### Unit Testing

```typescript
describe('FfmpegManager', () => {
  it('builds correct ffmpeg arguments', () => {
    const manager = new FfmpegManager(bufferStore);
    const args = manager['buildFfmpegArgs'](
      '/test/audio.mp3',
      ['64k', '128k'],
      [64, 128],
      '/tmp/test'
    );

    expect(args).toContain('-i');
    expect(args).toContain('/test/audio.mp3');
    expect(args).toContain('-b:a');
    expect(args).toContain('64k');
    expect(args).toContain('128k');
  });
});
```

### Integration Testing

```bash
# backend/tests/test-ffmpeg.ts
yarn workspace backend test:ffmpeg
```

Verifies:
- ffmpeg spawns successfully
- Multiple qualities generated
- Segments captured to BufferStore
- HLS playlists valid

---

## Future Enhancements

- [ ] Add dynamic bitrate adjustment (based on CPU load)
- [ ] Add quality presets (low/medium/high)
- [ ] Add video support (currently audio-only)
- [ ] Add hardware acceleration (RPi GPU)
- [ ] Add audio normalization (loudness)
- [ ] Add support for DRM (encrypted segments)

---

## Related Patterns

- [Memory-Only Streaming](./memory-streaming.md) - Segment capture and storage
- [Session State Machine](./session-state-machine.md) - Process lifecycle management

---

## Related Files

- `backend/src/services/FfmpegManager.ts` - ffmpeg spawning and configuration
- `backend/src/services/BufferStore.ts` - Master playlist generation
- `backend/src/config/env.ts` - Configuration (bitrates, segment duration)

---

**References**:
- [ffmpeg Documentation](https://ffmpeg.org/ffmpeg.html)
- [HLS Authoring Specification](https://developer.apple.com/documentation/http_live_streaming)
- [AAC Encoding Guide](https://trac.ffmpeg.org/wiki/Encode/AAC)
