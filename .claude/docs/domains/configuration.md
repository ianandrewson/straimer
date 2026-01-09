# Configuration Domain

**Path**: `backend/src/config/`
**Purpose**: Centralized environment variable management and application constants
**Confidence**: High

---

## Overview

The Configuration domain provides a single source of truth for all environment variables and application constants. It uses dotenv for environment loading and exports typed configuration objects for use throughout the application.

---

## Files

### `env.ts`
**Purpose**: Environment variable loader with type-safe defaults

**Exports**:
- `config` - Typed configuration object with all environment variables

**Key Configuration Variables**:

```typescript
export const config = {
  PORT: number,                    // Server port (default: 3000)
  NODE_ENV: string,                // Environment (development/production)
  API_KEY: string,                 // Bearer token for auth
  AUDIO_LIBRARY_PATH: string,      // Path to audio-library.json
  AUDIO_FILES_ROOT: string,        // Root directory for audio files
  SESSION_IDLE_TIMEOUT: number,    // Session timeout in ms (default: 300000)
  SESSION_CLEANUP_INTERVAL: number,// Cleanup interval in ms (default: 60000)
  HLS_SEGMENT_DURATION: number,    // Segment duration in seconds (default: 10)
  HLS_BITRATES: number[],          // Array of bitrates in kbps (default: [64, 128, 256])
  LOG_LEVEL: string,               // Pino log level (default: 'info')
} as const;
```

**Type Safety**: All numeric values parsed with `parseInt()` or `Number()`, arrays parsed from comma-separated strings.

**Location**: `/Users/ianandrewson/coding/projects/straimer/backend/src/config/env.ts`

---

### `constants.ts`
**Purpose**: Application-wide constants for HTTP status codes, session states, and error messages

**Exports**:

```typescript
// HTTP Status Codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
} as const;

// Session States
export const SESSION_STATES = {
  INITIALIZING: 'INITIALIZING',
  READY: 'READY',
  ACTIVE: 'ACTIVE',
  IDLE: 'IDLE',
  TERMINATED: 'TERMINATED',
} as const;

// Error Messages
export const ERROR_MESSAGES = {
  INVALID_API_KEY: 'Invalid or missing API key',
  SESSION_NOT_FOUND: 'Session not found',
  AUDIO_FILE_NOT_FOUND: 'Audio file not found',
  // ... more error messages
} as const;
```

**Usage Pattern**: Import constants instead of magic numbers/strings throughout codebase.

**Location**: `/Users/ianandrewson/coding/projects/straimer/backend/src/config/constants.ts`

---

## Usage Examples

### Importing Configuration

```typescript
import { config } from './config/env';

// Access environment variables
const port = config.PORT;
const bitrates = config.HLS_BITRATES; // [64, 128, 256]
```

### Using HTTP Status Constants

```typescript
import { HTTP_STATUS } from './config/constants';

res.status(HTTP_STATUS.OK).json({ message: 'Success' });
res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Not found' });
```

### Using Session States

```typescript
import { SESSION_STATES } from './config/constants';

if (session.state === SESSION_STATES.READY) {
  // Session is ready for streaming
}
```

---

## Environment Variables

All environment variables are loaded from `backend/.env` file (see `backend/.env.example` for template).

### Required Variables

- `API_KEY` - Bearer token for authentication (no default, must be set)

### Optional Variables (with defaults)

| Variable | Default | Type | Description |
|----------|---------|------|-------------|
| `PORT` | 3000 | number | HTTP server port |
| `NODE_ENV` | development | string | Environment mode |
| `AUDIO_LIBRARY_PATH` | ./data/audio-library.json | string | Audio library JSON path |
| `AUDIO_FILES_ROOT` | /media/audio | string | Root directory for audio files |
| `SESSION_IDLE_TIMEOUT_MS` | 300000 (5 min) | number | Session idle timeout |
| `SESSION_CLEANUP_INTERVAL_MS` | 60000 (1 min) | number | Cleanup check interval |
| `HLS_SEGMENT_DURATION` | 10 | number | HLS segment duration (seconds) |
| `HLS_BITRATES` | 64,128,256 | number[] | Comma-separated bitrates (kbps) |
| `LOG_LEVEL` | info | string | Pino log level |

---

## Configuration Validation

**Current State**: Basic runtime validation via TypeScript types and parseInt/Number parsing.

**Future Improvements**:
- Add Joi schema validation for environment variables on startup
- Fail fast if required variables missing
- Validate numeric ranges (e.g., PORT between 1-65535)

---

## Best Practices

### Adding New Configuration

1. Add environment variable to `backend/.env.example` with documentation
2. Add parsing logic to `config/env.ts` with type annotation and default
3. Update this documentation with variable details
4. Use the config value throughout codebase via `config` import

### Using Constants

1. **DO**: Import constants from `config/constants.ts`
   ```typescript
   import { HTTP_STATUS } from './config/constants';
   res.status(HTTP_STATUS.OK);
   ```

2. **DON'T**: Use magic numbers or strings
   ```typescript
   res.status(200); // Bad
   if (session.state === 'READY') // Bad
   ```

### Type Safety

- All config values typed with TypeScript
- Use `as const` to prevent accidental mutation
- Constants objects use `as const` for literal type inference

---

## Dependencies

- **dotenv** (^16.4.1) - Environment variable loading

---

## Testing Considerations

- Environment variables can be mocked by setting `process.env` before importing config
- Test different environment configurations (development vs production)
- Verify default values apply when variables not set

---

## Related Files

- `backend/.env.example` - Template for environment variables
- `backend/src/index.ts` - Application entry point (uses config)
- All services and routes import from this domain

---

## Common Issues

**Issue**: Environment variables not loading
- **Solution**: Ensure `backend/.env` file exists and dotenv loads before any imports

**Issue**: Wrong data types (e.g., string instead of number)
- **Solution**: Use `parseInt()` or `Number()` for numeric values, verify parsing logic

**Issue**: Comma-separated values not parsing
- **Solution**: Use `.split(',').map(Number)` for numeric arrays

---

**Location**: `/Users/ianandrewson/coding/projects/straimer/backend/src/config/`
**Key Files**: `env.ts`, `constants.ts`
