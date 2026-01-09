# Utils Domain

**Path**: `backend/src/utils/`
**Purpose**: Shared utilities and helper functions
**Confidence**: High

---

## Overview

The Utils domain provides reusable utilities for logging, validation, graceful shutdown, and memory monitoring. These utilities are used throughout the application for cross-cutting concerns.

---

## Files

### `logger.ts`
**Purpose**: Pino logger configuration and singleton instance

**Exports**:
- `logger` - Configured Pino logger instance

**Configuration**:
```typescript
import pino from 'pino';
import { config } from '../config/env';

export const logger = pino({
  level: config.LOG_LEVEL,
  transport:
    config.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
});
```

**Features**:
- **Structured Logging**: JSON format in production, pretty-printed in development
- **Log Levels**: trace, debug, info, warn, error, fatal (controlled by `LOG_LEVEL` env var)
- **Contextual Logging**: Supports additional fields via object parameter

**Usage Examples**:

```typescript
import { logger } from './utils/logger';

// Simple message
logger.info('Server started');

// With context
logger.info({ port: 3000, env: 'development' }, 'Server started');

// Error logging
logger.error({ error: err, sessionId }, 'Failed to create session');

// Different log levels
logger.debug({ data }, 'Debug information');
logger.warn({ timeout: 5000 }, 'Session timeout');
logger.fatal({ error }, 'Critical failure, exiting');
```

**Log Output (Development)**:
```
[12:34:56] INFO: Server started
    port: 3000
    env: "development"
```

**Log Output (Production)**:
```json
{
  "level": 30,
  "time": 1641234567890,
  "pid": 12345,
  "hostname": "raspberrypi",
  "port": 3000,
  "env": "development",
  "msg": "Server started"
}
```

**Best Practices**:
- Use object parameter for contextual data
- Keep messages concise and descriptive
- Use appropriate log levels
- Avoid logging sensitive data (tokens, passwords)

**Location**: `/Users/ianandrewson/coding/projects/straimer/backend/src/utils/logger.ts`

---

### `validation.ts`
**Purpose**: Joi schema validation utilities

**Exports**:
- Schema validation helper functions
- Common validation schemas

**Common Schemas**:

```typescript
import Joi from 'joi';

// Session creation schema
export const createSessionSchema = Joi.object({
  audioFileId: Joi.string().required(),
  qualities: Joi.array().items(Joi.string()).optional(),
});

// Audio file ID validation
export const audioFileIdSchema = Joi.string()
  .pattern(/^audio-[a-zA-Z0-9]+$/)
  .required();

// Session ID validation
export const sessionIdSchema = Joi.string()
  .pattern(/^sess_[a-f0-9-]{36}$/)
  .required();
```

**Validation Helper**:

```typescript
export function validateRequest<T>(
  data: unknown,
  schema: Joi.Schema
): { error?: Joi.ValidationError; value: T } {
  return schema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
  });
}
```

**Usage in Routes**:

```typescript
import { validateRequest, createSessionSchema } from '../utils/validation';

router.post('/sessions', (req, res) => {
  const { error, value } = validateRequest(req.body, createSessionSchema);

  if (error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Validation failed',
      details: error.details.map(d => d.message),
    });
  }

  // Proceed with validated data
  const { audioFileId, qualities } = value;
});
```

**Validation Options**:
- `abortEarly: false` - Collect all validation errors, not just first
- `stripUnknown: true` - Remove unknown fields from input

**Location**: `/Users/ianandrewson/coding/projects/straimer/backend/src/utils/validation.ts`

---

### `cleanup.ts`
**Purpose**: Graceful shutdown handler for SIGINT/SIGTERM signals

**Exports**:
- `setupGracefulShutdown(server, sessionManager)` - Register shutdown handlers

**Implementation**:

```typescript
import { Server } from 'http';
import { SessionManager } from '../services/SessionManager';
import { logger } from './logger';

export async function setupGracefulShutdown(
  server: Server,
  sessionManager: SessionManager
): Promise<void> {
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Received shutdown signal');

    // Stop accepting new connections
    server.close(() => {
      logger.info('HTTP server closed');
    });

    // Terminate all sessions
    await sessionManager.shutdown();

    logger.info('Graceful shutdown complete');
    process.exit(0);
  };

  // Register signal handlers
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.fatal({ error }, 'Uncaught exception');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.fatal({ reason, promise }, 'Unhandled promise rejection');
    process.exit(1);
  });
}
```

**Shutdown Sequence**:
1. **Signal Received**: SIGINT (Ctrl+C) or SIGTERM (Docker/systemd)
2. **Stop Server**: Stop accepting new connections
3. **Cleanup Sessions**: Terminate all sessions, kill ffmpeg processes
4. **Clear Buffers**: Release memory
5. **Exit**: Graceful exit with code 0

**Benefits**:
- Clean ffmpeg process termination
- No orphaned processes
- Memory released properly
- Database connections closed (if applicable)

**Usage**:
```typescript
// In index.ts
await setupGracefulShutdown(server, sessionManager);
```

**Testing**:
```bash
# Send SIGINT
Ctrl+C

# Send SIGTERM
kill $(pidof node)
```

**Location**: `/Users/ianandrewson/coding/projects/straimer/backend/src/utils/cleanup.ts`

---

### `memory.ts`
**Purpose**: Memory monitoring and reporting utilities

**Exports**:
- `getMemoryStats()` - Get current memory usage
- `startMemoryMonitoring(interval, threshold)` - Start periodic monitoring
- `formatBytes(bytes)` - Human-readable byte formatting

**Memory Stats**:

```typescript
export interface MemoryStats {
  rss: number;              // Resident Set Size (total memory)
  rssFormatted: string;     // e.g., "450 MB"
  heapTotal: number;        // Total heap allocated
  heapUsed: number;         // Heap actually used
  heapUsedFormatted: string;
  heapUsedPercent: number;  // % of heap used
  external: number;         // C++ objects bound to JS
}

export function getMemoryStats(): MemoryStats {
  const mem = process.memoryUsage();

  return {
    rss: mem.rss,
    rssFormatted: formatBytes(mem.rss),
    heapTotal: mem.heapTotal,
    heapUsed: mem.heapUsed,
    heapUsedFormatted: formatBytes(mem.heapUsed),
    heapUsedPercent: (mem.heapUsed / mem.heapTotal) * 100,
    external: mem.external,
  };
}
```

**Memory Monitoring**:

```typescript
export function startMemoryMonitoring(
  intervalMs: number = 300000,  // 5 minutes
  warningThresholdMB: number = 500
): NodeJS.Timeout {
  return setInterval(() => {
    const stats = getMemoryStats();

    logger.debug(stats, 'Memory usage');

    // Warn if memory exceeds threshold
    if (stats.rss / 1024 / 1024 > warningThresholdMB) {
      logger.warn(
        {
          rss: stats.rssFormatted,
          threshold: `${warningThresholdMB} MB`,
        },
        'Memory usage above threshold'
      );
    }
  }, intervalMs);
}
```

**Byte Formatting**:

```typescript
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
```

**Usage**:

```typescript
// Start monitoring (in index.ts)
startMemoryMonitoring(300000, 500); // Every 5 min, warn at 500MB

// Get current stats
const stats = getMemoryStats();
console.log(`Memory: ${stats.rssFormatted}`);
console.log(`Heap: ${stats.heapUsedPercent.toFixed(1)}%`);

// Format bytes
formatBytes(9830400); // "9.37 MB"
```

**Memory Metrics**:
- **RSS (Resident Set Size)**: Total memory including heap, stack, and code
- **Heap Used**: Memory used by JS objects (buffers, sessions, etc.)
- **Heap Total**: Memory allocated by V8 (may be larger than used)
- **External**: Memory used by C++ objects (e.g., Buffer internals)

**Monitoring Strategy**:
- Check every 5 minutes in production
- Warn at 500MB threshold (Raspberry Pi 4 has 2-4GB RAM)
- Log to Pino for alerting/dashboards
- Consider adding metrics export (Prometheus)

**Location**: `/Users/ianandrewson/coding/projects/straimer/backend/src/utils/memory.ts`

---

## Utility Patterns

### Singleton Pattern (Logger)
Logger is a singleton instance, configured once and imported throughout the app:

```typescript
// utils/logger.ts
export const logger = pino({ ... });

// Imported everywhere
import { logger } from './utils/logger';
```

### Factory Pattern (Validation)
Validation uses factory functions for schema creation:

```typescript
export function createSchemaValidator<T>(schema: Joi.Schema) {
  return (data: unknown) => validateRequest<T>(data, schema);
}
```

### Observer Pattern (Memory Monitoring)
Memory monitoring runs on interval and emits warnings:

```typescript
startMemoryMonitoring(interval, threshold);
// Logs warnings when threshold exceeded
```

---

## Testing Utils

### Testing Logger
```typescript
import { logger } from './logger';

// Mock logger in tests
jest.spyOn(logger, 'info').mockImplementation();

// Verify logs
expect(logger.info).toHaveBeenCalledWith({ port: 3000 }, 'Server started');
```

### Testing Validation
```typescript
import { validateRequest, createSessionSchema } from './validation';

it('validates valid session request', () => {
  const { error, value } = validateRequest(
    { audioFileId: 'audio-001' },
    createSessionSchema
  );

  expect(error).toBeUndefined();
  expect(value.audioFileId).toBe('audio-001');
});

it('rejects invalid session request', () => {
  const { error } = validateRequest(
    { audioFileId: 123 },
    createSessionSchema
  );

  expect(error).toBeDefined();
});
```

### Testing Memory Utils
```typescript
import { formatBytes, getMemoryStats } from './memory';

it('formats bytes correctly', () => {
  expect(formatBytes(1024)).toBe('1 KB');
  expect(formatBytes(1048576)).toBe('1 MB');
  expect(formatBytes(9830400)).toBe('9.37 MB');
});

it('gets memory stats', () => {
  const stats = getMemoryStats();
  expect(stats.rss).toBeGreaterThan(0);
  expect(stats.heapUsedPercent).toBeGreaterThanOrEqual(0);
  expect(stats.heapUsedPercent).toBeLessThanOrEqual(100);
});
```

---

## Common Issues

**Issue**: Logs not appearing in development
- **Cause**: LOG_LEVEL set too high (e.g., 'error')
- **Solution**: Set LOG_LEVEL=debug in .env

**Issue**: Validation errors not descriptive
- **Cause**: Using `abortEarly: true` (default)
- **Solution**: Set `abortEarly: false` to collect all errors

**Issue**: Graceful shutdown not working
- **Cause**: Signal handlers not registered
- **Solution**: Ensure `setupGracefulShutdown()` called after server starts

**Issue**: Memory warnings appearing constantly
- **Cause**: Threshold too low or memory leak
- **Solution**: Increase threshold or investigate memory usage

---

## Best Practices

### Logging
- Use structured logging with context objects
- Choose appropriate log levels
- Avoid logging sensitive data
- Use correlation IDs for request tracing

### Validation
- Validate at API boundaries (routes)
- Use descriptive error messages
- Strip unknown fields for security
- Return detailed validation errors in development

### Cleanup
- Always register shutdown handlers
- Clean up resources in reverse order of creation
- Set reasonable timeouts for cleanup operations
- Log shutdown progress for debugging

### Memory Monitoring
- Monitor memory in production
- Set thresholds based on available RAM
- Alert on sustained high usage
- Correlate memory usage with session count

---

## Future Enhancements

- [ ] Add request ID middleware (for log correlation)
- [ ] Add validation schema caching
- [ ] Add memory profiling utilities
- [ ] Add health check utilities (disk, CPU, network)
- [ ] Add metrics export (Prometheus format)
- [ ] Add log sampling for high-traffic scenarios

---

## Dependencies

- **pino** (^8.17.2) - Structured logging
- **pino-pretty** (^10.3.1) - Development log formatting
- **joi** (^17.12.0) - Schema validation

---

**Location**: `/Users/ianandrewson/coding/projects/straimer/backend/src/utils/`
**Key Files**: `logger.ts`, `validation.ts`, `cleanup.ts`, `memory.ts`
