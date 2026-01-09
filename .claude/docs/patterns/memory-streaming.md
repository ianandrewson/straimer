# Memory-Only Streaming Pattern

**Category**: Performance Optimization
**Confidence**: High
**Location**: `backend/src/services/FfmpegManager.ts`, `backend/src/services/BufferStore.ts`

---

## Overview

The Memory-Only Streaming pattern minimizes disk I/O by storing HLS segments and playlists entirely in RAM. ffmpeg outputs to temporary disk locations, file watchers immediately capture the output to memory buffers, and temporary files are deleted. This reduces SD card wear on Raspberry Pi while maintaining streaming performance.

---

## Architecture

```
┌─────────────┐
│ Audio File  │ (on disk, read-only)
└──────┬──────┘
       │
       v
┌─────────────┐
│   ffmpeg    │ (process)
└──────┬──────┘
       │ outputs to /tmp/straimer-<sessionId>/
       v
┌─────────────┐
│ File Watcher│ (fs.watch)
└──────┬──────┘
       │ reads file immediately
       v
┌─────────────┐
│ BufferStore │ (in-memory Map)
└──────┬──────┘
       │
       v
┌─────────────┐
│   Client    │ (streams from memory)
└─────────────┘
```

---

## Implementation

### Step 1: ffmpeg Output to Temporary Directory

```typescript
// Create temporary directory for session
const tempDir = path.join(tmpdir(), `straimer-${sessionId}`);
await fs.mkdir(tempDir, { recursive: true });

// ffmpeg outputs to temp dir
const args = [
  '-i', audioFilePath,
  // ... encoding options
  '-hls_segment_filename', `${tempDir}/${quality}/segment-%03d.ts`,
  `${tempDir}/${quality}/playlist.m3u8`,
];

const ffmpegProcess = spawn('ffmpeg', args);
```

**Location**: `/tmp/straimer-sess_<uuid>/`
- `/tmp/straimer-sess_123/64k/playlist.m3u8`
- `/tmp/straimer-sess_123/64k/segment-000.ts`
- `/tmp/straimer-sess_123/128k/playlist.m3u8`
- `/tmp/straimer-sess_123/128k/segment-000.ts`
- `/tmp/straimer-sess_123/256k/playlist.m3u8`
- `/tmp/straimer-sess_123/256k/segment-000.ts`

---

### Step 2: File Watching and Capture

```typescript
async setupFileWatchers(sessionId: string, tempDir: string, qualities: string[]): Promise<void> {
  const watchers: FSWatcher[] = [];

  for (const quality of qualities) {
    const qualityDir = path.join(tempDir, quality);
    await fs.mkdir(qualityDir, { recursive: true });

    // Watch directory for file changes
    const watcher = watch(qualityDir, async (eventType, filename) => {
      if (!filename) return;

      const filePath = path.join(qualityDir, filename);

      try {
        // Wait for file to be fully written
        await new Promise(r => setTimeout(r, 100));

        // Read file contents
        const data = await fs.readFile(filePath);

        // Store in memory
        const storageKey = `${quality}/${filename}`;
        this.bufferStore.set(sessionId, storageKey, data);

        logger.debug(
          { sessionId, quality, filename, size: data.length },
          'File captured to memory'
        );

        // Delete temporary file
        await fs.unlink(filePath);
      } catch (error) {
        logger.error({ sessionId, filename, error }, 'Error capturing file');
      }
    });

    watchers.push(watcher);
  }

  this.watchers.set(sessionId, watchers);
}
```

**Watch Events**:
- `rename` - New file created or renamed
- `change` - File modified

**Capture Flow**:
1. ffmpeg writes segment to disk
2. File watcher detects change
3. Wait 100ms for write completion
4. Read file contents to Buffer
5. Store in BufferStore with key `<quality>/<filename>`
6. Delete temporary file

---

### Step 3: In-Memory Storage

```typescript
export class BufferStore {
  private store: Map<string, Map<string, Buffer>>;

  set(sessionId: string, filename: string, data: Buffer): void {
    let sessionStore = this.store.get(sessionId);

    if (!sessionStore) {
      sessionStore = new Map();
      this.store.set(sessionId, sessionStore);
    }

    sessionStore.set(filename, data);
    logger.debug({ sessionId, filename, size: data.length }, 'Buffer stored');
  }

  get(sessionId: string, filename: string): Buffer | undefined {
    return this.store.get(sessionId)?.get(filename);
  }
}
```

**Data Structure**:
```
Map {
  'sess_123' => Map {
    'master.m3u8' => Buffer(300 bytes),
    '64k/playlist.m3u8' => Buffer(500 bytes),
    '64k/segment-000.ts' => Buffer(80000 bytes),
    '64k/segment-001.ts' => Buffer(80000 bytes),
    '128k/playlist.m3u8' => Buffer(500 bytes),
    '128k/segment-000.ts' => Buffer(160000 bytes),
    '256k/playlist.m3u8' => Buffer(500 bytes),
    '256k/segment-000.ts' => Buffer(320000 bytes),
  },
  'sess_456' => Map { ... }
}
```

---

### Step 4: Serving from Memory

```typescript
// Stream route handler
router.get('/stream/:sessionId/:quality/:segment', (req, res) => {
  const { sessionId, quality, segment } = req.params;

  // Update session access time
  sessionManager.updateLastAccessed(sessionId);

  // Retrieve from memory
  const filename = `${quality}/${segment}`;
  const buffer = bufferStore.get(sessionId, filename);

  if (!buffer) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      error: 'Segment not found or not ready'
    });
  }

  // Serve from memory
  res.set('Content-Type', 'video/mp2t');
  res.set('Content-Length', buffer.length.toString());
  res.send(buffer);
});
```

**No Disk Read**: Segments served directly from Node.js heap memory.

---

### Step 5: Cleanup

```typescript
async cleanup(sessionId: string, tempDir: string): Promise<void> {
  // Stop file watchers
  const watchers = this.watchers.get(sessionId);
  if (watchers) {
    for (const watcher of watchers) {
      watcher.close();
    }
    this.watchers.delete(sessionId);
  }

  // Delete temporary directory
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
    logger.debug({ sessionId, tempDir }, 'Temporary directory cleaned up');
  } catch (error) {
    logger.error({ sessionId, tempDir, error }, 'Error cleaning up temp dir');
  }

  // Clear memory buffers
  this.bufferStore.clear(sessionId);
}
```

**Cleanup Triggers**:
- Session termination (idle timeout or explicit DELETE)
- ffmpeg process exit
- Server shutdown

---

## Benefits

### 1. Reduced Disk Wear
**Problem**: Raspberry Pi uses SD cards, which have limited write cycles.

**Solution**: Minimize disk writes by:
- Writing segments to `/tmp` (often RAM-backed tmpfs)
- Immediately moving to memory and deleting temp file
- No persistent storage of HLS content

**Impact**:
- Typical streaming: 10 segments/minute × 3 qualities = 30 writes/minute
- Memory-only: Reduces persistent writes to 0
- Extends SD card lifespan

---

### 2. Improved Performance
**Disk I/O Latency**:
- SD card read: 10-50ms
- RAM read: <1ms

**Network Serving**:
- Serving from memory: Instant buffer access
- Serving from disk: File open + read overhead

**Result**: Lower latency, more consistent streaming performance

---

### 3. Simplified Cleanup
**No Orphaned Files**: All content automatically released when session ends.

**Graceful Shutdown**: No need to track and delete files on disk.

**Memory Management**: Node.js garbage collector handles buffer cleanup.

---

## Trade-offs

### Memory vs Disk

**Memory Usage**:
- 256kbps × 10 seconds = 320KB per segment
- 10 segments buffered = 3.2MB per quality
- 3 qualities = 9.6MB per session
- 10 concurrent sessions = 96MB

**Disk Usage**:
- Temporary: <100MB (rapidly cycled)
- Persistent: 0MB

**Decision**: Memory is abundant (2-4GB on RPi 4), SD card wear is limiting factor.

---

### Scaling Limits

**Maximum Concurrent Sessions**:
- 2GB RAM device: ~15-20 sessions (100-150MB buffer usage)
- 4GB RAM device: ~30-40 sessions (200-400MB buffer usage)
- Beyond limits: Implement session queueing or disk fallback

**Memory Pressure**:
- Monitor via `/health` endpoint
- Configure `SESSION_IDLE_TIMEOUT` to free sessions faster
- Alert at 500MB threshold

---

## Configuration

### tmpfs Mount (Recommended)

Ensure `/tmp` is mounted as tmpfs (RAM-backed filesystem):

```bash
# Check if /tmp is tmpfs
df -h /tmp

# If not, add to /etc/fstab
tmpfs /tmp tmpfs defaults,noatime,mode=1777,size=512M 0 0
```

**Benefits**:
- Even temporary disk writes go to RAM
- Automatic cleanup on reboot
- Fast file operations

---

### Memory Limits

```env
# Limit Node.js heap size (optional)
NODE_OPTIONS=--max-old-space-size=1024  # 1GB heap limit
```

**Recommendations**:
- 2GB device: 1GB heap limit
- 4GB device: 2GB heap limit
- Leave room for OS and ffmpeg processes

---

## Monitoring

### Memory Usage Tracking

```typescript
// Get buffer store statistics
const stats = bufferStore.getStats();

console.log(`Sessions: ${stats.sessionCount}`);
console.log(`Total files: ${stats.totalFiles}`);
console.log(`Total memory: ${formatBytes(stats.totalBytes)}`);

// Get per-session usage
const sessionBytes = bufferStore.getMemoryUsage(sessionId);
console.log(`Session ${sessionId}: ${formatBytes(sessionBytes)}`);
```

### Health Endpoint

```bash
curl http://localhost:3000/health
```

```json
{
  "status": "ok",
  "sessions": 5,
  "activeStreams": 3,
  "memory": {
    "rss": "450 MB",
    "heapUsed": "350 MB",
    "heapPercent": "70.0%"
  },
  "buffers": {
    "totalFiles": 150,
    "totalSize": "450 MB"
  }
}
```

---

## Error Handling

### File Watcher Failures

```typescript
watcher.on('error', (error) => {
  logger.error({ sessionId, error }, 'File watcher error');
  // Attempt to recreate watcher or terminate session
});
```

### Memory Exhaustion

```typescript
// Memory monitoring warns at threshold
if (stats.rss / 1024 / 1024 > 500) {
  logger.warn('Memory usage above 500MB threshold');
  // Consider terminating oldest idle sessions
}
```

### File Read Failures

```typescript
try {
  const data = await fs.readFile(filePath);
  this.bufferStore.set(sessionId, storageKey, data);
} catch (error) {
  // Segment will be missing, client will get 404
  // Client should retry (segment may not be fully written)
  logger.error({ sessionId, filename, error }, 'Failed to read segment');
}
```

---

## Testing

### Memory Leak Testing

```typescript
describe('BufferStore memory management', () => {
  it('releases memory on session cleanup', async () => {
    const store = new BufferStore();
    const sessionId = 'sess_test';

    // Store buffers
    for (let i = 0; i < 10; i++) {
      store.set(sessionId, `segment-${i}.ts`, Buffer.alloc(320000));
    }

    const before = store.getMemoryUsage(sessionId);
    expect(before).toBe(3200000);

    // Clear session
    store.clear(sessionId);

    const after = store.getMemoryUsage(sessionId);
    expect(after).toBe(0);

    // Verify Node.js GC can reclaim memory
    global.gc?.(); // Requires --expose-gc flag
  });
});
```

### Integration Testing

```typescript
it('captures segments from ffmpeg to memory', async () => {
  const bufferStore = new BufferStore();
  const ffmpegManager = new FfmpegManager(bufferStore);

  const sessionId = 'sess_integration';
  const ffmpegProcess = await ffmpegManager.spawn({
    sessionId,
    audioFilePath: '/test/audio.mp3',
    qualities: ['128k'],
    bitrates: [128],
  });

  // Wait for segments to be generated
  await new Promise(r => setTimeout(r, 5000));

  // Check segments in memory
  const files = bufferStore.getSessionFiles(sessionId);
  expect(files).toContain('128k/playlist.m3u8');
  expect(files.some(f => f.startsWith('128k/segment-'))).toBe(true);

  // Cleanup
  ffmpegProcess.kill('SIGTERM');
  bufferStore.clear(sessionId);
});
```

---

## Performance Benchmarks

### Memory Usage (Typical Session)

| Quality | Segment Size | 10 Segments | Playlist | Total |
|---------|-------------|-------------|----------|-------|
| 64k | 80 KB | 800 KB | 500 bytes | ~800 KB |
| 128k | 160 KB | 1.6 MB | 500 bytes | ~1.6 MB |
| 256k | 320 KB | 3.2 MB | 500 bytes | ~3.2 MB |
| **Total** | | | | **~5.6 MB** |

Add master playlist (300 bytes) → **~5.6 MB per session**

---

### Disk I/O Reduction

**Without Memory Streaming**:
- Segment writes: 30/minute (10 segments × 3 qualities)
- Segment reads: 30/minute (client fetching)
- Total I/O: 60 operations/minute

**With Memory Streaming**:
- Temporary writes: 30/minute (to `/tmp`, RAM-backed)
- Segment reads: 0 (served from memory)
- Persistent I/O: 0 operations/minute

**Reduction**: 100% reduction in persistent disk I/O

---

## Future Enhancements

- [ ] Implement LRU cache for segments (evict oldest segments after N)
- [ ] Add disk fallback for memory exhaustion
- [ ] Add segment compression (gzip) in memory
- [ ] Add segment streaming (pipe from ffmpeg without temp files)
- [ ] Add memory pool for Buffer allocation
- [ ] Add per-session memory limits

---

## Related Patterns

- [Multi-Bitrate Transcoding](./multi-bitrate-transcoding.md) - ffmpeg output configuration
- [Session State Machine](./session-state-machine.md) - Session lifecycle and cleanup

---

## Related Files

- `backend/src/services/FfmpegManager.ts` - File watching and capture
- `backend/src/services/BufferStore.ts` - In-memory storage
- `backend/src/routes/stream.ts` - Serving from memory

---

**References**:
- [Node.js Buffer Documentation](https://nodejs.org/api/buffer.html)
- [Node.js fs.watch Documentation](https://nodejs.org/api/fs.html#fswatchfilename-options-listener)
- [HLS Protocol Specification (RFC 8216)](https://tools.ietf.org/html/rfc8216)
