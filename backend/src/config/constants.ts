export const SESSION_STATES = {
  INITIALIZING: 'initializing',
  READY: 'ready',
  ACTIVE: 'active',
  IDLE: 'idle',
  TERMINATED: 'terminated',
} as const;

export const QUALITY_LEVELS = {
  BAD: '64k',
  LOW: '128k',
  MEDIUM: '256k',
  HIGH: '320k',
} as const;

export const FFMPEG_PRESETS = {
  ULTRAFAST: 'ultrafast',
  SUPERFAST: 'superfast',
  FAST: 'fast',
} as const;

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
} as const;

export const MIME_TYPES = {
  HLS_PLAYLIST: 'application/vnd.apple.mpegurl',
  MPEG_TS: 'video/MP2T',
  JSON: 'application/json',
} as const;
