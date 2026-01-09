# Models Domain

**Path**: `backend/src/models/`
**Purpose**: TypeScript type definitions and interfaces for domain entities
**Confidence**: High

---

## Overview

The Models domain defines TypeScript types and interfaces for core domain entities: sessions, audio files, and streaming configurations. These types ensure type safety throughout the application.

---

## Files

### `Session.ts`
**Purpose**: Session state and metadata types

**Exported Types**:

```typescript
// Session state type (union of valid states)
export type SessionState =
  | 'INITIALIZING'
  | 'READY'
  | 'ACTIVE'
  | 'IDLE'
  | 'TERMINATED';

// Internal session representation
export interface Session {
  id: string;                          // Unique session ID (sess_<uuid>)
  audioFileId: string;                 // Reference to audio library file
  audioFilePath: string;               // Absolute path to audio file
  qualities: string[];                 // Quality levels (e.g., ['64k', '128k', '256k'])
  state: SessionState;                 // Current session state
  ffmpegProcess: ChildProcess | null;  // Running ffmpeg process
  createdAt: Date;                     // Session creation timestamp
  lastAccessedAt: Date;                // Last access timestamp (for idle detection)
  idleTimeoutHandle: NodeJS.Timeout | null; // Idle timeout timer reference
}

// Public session information (API response)
export interface SessionInfo {
  sessionId: string;        // Session ID
  audioFileId: string;      // Audio file reference
  status: SessionState;     // Current state
  createdAt: string;        // ISO 8601 timestamp
  lastAccessedAt: string;   // ISO 8601 timestamp
  expiresAt: string;        // ISO 8601 timestamp (calculated)
}
```

**Usage**:
- `Session` - Internal representation used by SessionManager
- `SessionInfo` - External representation returned by API endpoints

**State Transitions**:
```
INITIALIZING → READY → ACTIVE → IDLE → TERMINATED
     ↓                              ↓
     └──────────→ TERMINATED ←──────┘
```

**Location**: `/Users/ianandrewson/coding/projects/straimer/backend/src/models/Session.ts`

---

### `AudioFile.ts`
**Purpose**: Audio library file structure

**Exported Types**:

```typescript
// Single audio file entry
export interface AudioFile {
  id: string;           // Unique identifier
  title: string;        // Display title
  artist?: string;      // Artist name (optional)
  album?: string;       // Album name (optional)
  duration?: number;    // Duration in seconds (optional)
  path: string;         // Absolute path to audio file
  format?: string;      // File format (mp3, flac, etc.) (optional)
  bitrate?: number;     // Original bitrate in kbps (optional)
  size?: number;        // File size in bytes (optional)
}

// Audio library structure (root)
export interface AudioLibrary {
  version: string;      // Library schema version
  files: AudioFile[];   // Array of audio files
}
```

**JSON Structure Example**:
```json
{
  "version": "1.0",
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
  ]
}
```

**Usage**:
- Loaded from JSON file at `config.AUDIO_LIBRARY_PATH`
- Validated by AudioLibrary service
- Referenced by Session via `audioFileId`

**Location**: `/Users/ianandrewson/coding/projects/straimer/backend/src/models/AudioFile.ts`

---

### `StreamConfig.ts`
**Purpose**: ffmpeg streaming configuration

**Exported Types**:

```typescript
// Configuration for spawning ffmpeg process
export interface StreamConfig {
  sessionId: string;        // Session identifier
  audioFilePath: string;    // Input audio file path
  qualities: string[];      // Quality labels (e.g., ['64k', '128k', '256k'])
  bitrates: number[];       // Bitrates in kbps (e.g., [64, 128, 256])
}

// ffmpeg output configuration
export interface OutputConfig {
  quality: string;          // Quality label (e.g., '128k')
  bitrate: number;          // Bitrate in kbps (e.g., 128)
  outputPath: string;       // Output path pattern for HLS files
}
```

**Usage**:
- Passed to FfmpegManager when spawning processes
- Defines multi-bitrate output configuration
- Maps quality labels to bitrate values

**Example**:
```typescript
const streamConfig: StreamConfig = {
  sessionId: 'sess_123',
  audioFilePath: '/media/audio/track.mp3',
  qualities: ['64k', '128k', '256k'],
  bitrates: [64, 128, 256],
};
```

**Location**: `/Users/ianandrewson/coding/projects/straimer/backend/src/models/StreamConfig.ts`

---

## Type Safety Patterns

### Strict TypeScript
- All models use strict typing (no `any` types)
- Optional fields explicitly marked with `?`
- Type unions for enums (e.g., `SessionState`)

### Type Guards
Consider implementing type guards for runtime validation:

```typescript
export function isSessionState(value: string): value is SessionState {
  return ['INITIALIZING', 'READY', 'ACTIVE', 'IDLE', 'TERMINATED'].includes(value);
}
```

### Type Inference
- Use `as const` for constant objects (see `config/constants.ts`)
- Leverage TypeScript's type inference where possible

---

## Data Flow

### Session Lifecycle
1. **Creation**: `POST /api/sessions` creates `Session` object with state `INITIALIZING`
2. **Ready**: ffmpeg starts, state transitions to `READY`
3. **Active**: Client accesses stream, state transitions to `ACTIVE`
4. **Idle**: No access for timeout period, state transitions to `IDLE`
5. **Terminated**: Cleanup triggered, state transitions to `TERMINATED`

### Audio File Loading
1. **Load**: AudioLibrary reads JSON from `AUDIO_LIBRARY_PATH`
2. **Parse**: JSON parsed into `AudioLibrary` type
3. **Validate**: File paths validated for existence
4. **Store**: Files stored in Map for O(1) lookup by ID

### Stream Configuration
1. **Request**: Client requests session with `audioFileId`
2. **Lookup**: AudioLibrary retrieves `AudioFile` by ID
3. **Build**: SessionManager constructs `StreamConfig`
4. **Spawn**: FfmpegManager uses config to spawn process

---

## Validation

### Current Validation
- TypeScript compile-time type checking
- Runtime file existence validation (AudioLibrary)
- Session state machine enforcement (SessionManager)

### Recommended Enhancements
Add Joi schemas for runtime validation:

```typescript
import Joi from 'joi';

export const audioFileSchema = Joi.object({
  id: Joi.string().required(),
  title: Joi.string().required(),
  artist: Joi.string().optional(),
  album: Joi.string().optional(),
  duration: Joi.number().positive().optional(),
  path: Joi.string().required(),
  format: Joi.string().optional(),
  bitrate: Joi.number().positive().optional(),
  size: Joi.number().positive().optional(),
});
```

---

## API Representations

### Internal vs External Types

**Internal (`Session`)**:
- Contains runtime data (ChildProcess, Timeout handles)
- Used by SessionManager for state management
- Not serializable to JSON

**External (`SessionInfo`)**:
- Serializable to JSON
- Safe to expose via API
- No sensitive or runtime-specific data

### Conversion Pattern
```typescript
function sessionToSessionInfo(session: Session): SessionInfo {
  return {
    sessionId: session.id,
    audioFileId: session.audioFileId,
    status: session.state,
    createdAt: session.createdAt.toISOString(),
    lastAccessedAt: session.lastAccessedAt.toISOString(),
    expiresAt: new Date(
      session.lastAccessedAt.getTime() + config.SESSION_IDLE_TIMEOUT
    ).toISOString(),
  };
}
```

---

## Dependencies

No external dependencies (pure TypeScript types).

---

## Testing Models

### Type Testing
Use TypeScript compiler to verify type correctness:
```bash
yarn workspace backend type-check
```

### Runtime Validation Testing
```typescript
import { audioFileSchema } from './schemas';

const validFile = {
  id: 'audio-001',
  title: 'Test Track',
  path: '/media/audio/test.mp3',
};

const { error, value } = audioFileSchema.validate(validFile);
expect(error).toBeUndefined();
```

---

## Common Issues

**Issue**: Type mismatch between internal and external representations
- **Solution**: Use conversion functions, maintain clear separation

**Issue**: Optional fields causing undefined errors
- **Solution**: Use optional chaining (`?.`) and nullish coalescing (`??`)

**Issue**: Date serialization in API responses
- **Solution**: Convert to ISO 8601 strings before sending

---

## Best Practices

### Adding New Models
1. Define interface in new file under `models/`
2. Export all types from interface
3. Document required vs optional fields
4. Add validation schema if needed
5. Update this documentation

### Using Models
1. Import types at file level
2. Use explicit type annotations for function parameters
3. Avoid type assertions (`as Type`) unless necessary
4. Prefer interfaces over types for object shapes

### Evolving Models
1. Add new optional fields for backward compatibility
2. Deprecate old fields before removing
3. Version API responses if breaking changes needed
4. Update documentation with migration notes

---

## Related Files

- `backend/src/services/SessionManager.ts` - Uses `Session` and `SessionInfo`
- `backend/src/services/AudioLibrary.ts` - Uses `AudioFile` and `AudioLibrary`
- `backend/src/services/FfmpegManager.ts` - Uses `StreamConfig`
- `backend/src/routes/session.ts` - Returns `SessionInfo`
- `backend/src/routes/library.ts` - Returns `AudioFile[]`

---

**Location**: `/Users/ianandrewson/coding/projects/straimer/backend/src/models/`
**Key Files**: `Session.ts`, `AudioFile.ts`, `StreamConfig.ts`
