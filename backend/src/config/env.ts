import dotenv from 'dotenv';

dotenv.config();

export const config = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  API_KEY: process.env.API_KEY || '',
  AUDIO_LIBRARY_PATH: process.env.AUDIO_LIBRARY_PATH || './data/audio-library.json',
  AUDIO_FILES_ROOT: process.env.AUDIO_FILES_ROOT || '/media/audio',
  SESSION_IDLE_TIMEOUT: parseInt(process.env.SESSION_IDLE_TIMEOUT_MS || '300000', 10),
  SESSION_CLEANUP_INTERVAL: parseInt(process.env.SESSION_CLEANUP_INTERVAL_MS || '60000', 10),
  HLS_SEGMENT_DURATION: parseInt(process.env.HLS_SEGMENT_DURATION || '10', 10),
  HLS_BITRATES: (process.env.HLS_BITRATES || '64,128,256').split(',').map(Number),
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
} as const;
