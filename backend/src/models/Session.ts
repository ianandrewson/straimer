import { ChildProcess } from 'child_process';
import { SESSION_STATES } from '../config/constants';

export type SessionState = typeof SESSION_STATES[keyof typeof SESSION_STATES];

export interface Session {
  id: string;
  audioFileId: string;
  audioFilePath: string;
  qualities: string[];
  state: SessionState;
  ffmpegProcess: ChildProcess | null;
  createdAt: Date;
  lastAccessedAt: Date;
  idleTimeoutHandle: NodeJS.Timeout | null;
}

export interface SessionInfo {
  sessionId: string;
  audioFileId: string;
  status: SessionState;
  createdAt: string;
  lastAccessedAt: string;
  expiresAt: string;
}
