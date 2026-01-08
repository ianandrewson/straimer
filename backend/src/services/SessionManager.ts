import { v4 as uuidv4 } from 'uuid';
import { Session, SessionInfo } from '../models/Session';
import { BufferStore } from './BufferStore';
import { AudioLibrary } from './AudioLibrary';
import { logger } from '../utils/logger';
import { config } from '../config/env';
import { SESSION_STATES } from '../config/constants';

export class SessionManager {
  private sessions: Map<string, Session>;
  private bufferStore: BufferStore;
  private audioLibrary: AudioLibrary;
  private cleanupInterval: NodeJS.Timeout | null;

  constructor(bufferStore: BufferStore, audioLibrary: AudioLibrary) {
    this.sessions = new Map();
    this.bufferStore = bufferStore;
    this.audioLibrary = audioLibrary;
    this.cleanupInterval = null;
  }

  async initialize(): Promise<void> {
    logger.info('Initializing SessionManager');
    await this.audioLibrary.load();
    this.startCleanupTimer();
    logger.info('SessionManager initialized');
  }

  async createSession(audioFileId: string, qualities?: string[]): Promise<string> {
    const audioFile = this.audioLibrary.getById(audioFileId);
    if (!audioFile) {
      throw new Error(`Audio file not found: ${audioFileId}`);
    }

    const isValid = await this.audioLibrary.validate(audioFileId);
    if (!isValid) {
      throw new Error(`Audio file not accessible: ${audioFile.path}`);
    }

    const sessionId = `sess_${uuidv4()}`;
    const qualityLevels = qualities || Object.values(config.HLS_BITRATES.map((b) => `${b}k`));

    const session: Session = {
      id: sessionId,
      audioFileId,
      audioFilePath: audioFile.path,
      qualities: qualityLevels,
      state: SESSION_STATES.INITIALIZING,
      ffmpegProcess: null,
      createdAt: new Date(),
      lastAccessedAt: new Date(),
      idleTimeoutHandle: null,
    };

    this.sessions.set(sessionId, session);
    this.startIdleTimer(sessionId);

    logger.info(
      {
        sessionId,
        audioFileId,
        audioPath: audioFile.path,
        qualities: qualityLevels,
      },
      'Session created'
    );

    return sessionId;
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  getSessionInfo(sessionId: string): SessionInfo | undefined {
    const session = this.getSession(sessionId);
    if (!session) {
      return undefined;
    }

    const expiresAt = new Date(
      session.lastAccessedAt.getTime() + config.SESSION_IDLE_TIMEOUT
    );

    return {
      sessionId: session.id,
      audioFileId: session.audioFileId,
      status: session.state,
      createdAt: session.createdAt.toISOString(),
      lastAccessedAt: session.lastAccessedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
  }

  getAllSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).map((session) => {
      const expiresAt = new Date(
        session.lastAccessedAt.getTime() + config.SESSION_IDLE_TIMEOUT
      );

      return {
        sessionId: session.id,
        audioFileId: session.audioFileId,
        status: session.state,
        createdAt: session.createdAt.toISOString(),
        lastAccessedAt: session.lastAccessedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
      };
    });
  }

  updateLastAccessed(sessionId: string): void {
    const session = this.getSession(sessionId);
    if (!session) {
      return;
    }

    session.lastAccessedAt = new Date();

    // Update state from IDLE to ACTIVE if needed
    if (session.state === SESSION_STATES.IDLE) {
      session.state = SESSION_STATES.ACTIVE;
      logger.debug({ sessionId }, 'Session reactivated from idle');
    }

    // Reset idle timer
    this.resetIdleTimer(sessionId);
  }

  async terminateSession(sessionId: string): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session) {
      logger.warn({ sessionId }, 'Attempted to terminate non-existent session');
      return;
    }

    logger.info({ sessionId, state: session.state }, 'Terminating session');

    // Clear idle timeout
    if (session.idleTimeoutHandle) {
      clearTimeout(session.idleTimeoutHandle);
      session.idleTimeoutHandle = null;
    }

    // Kill ffmpeg process if running
    if (session.ffmpegProcess) {
      try {
        session.ffmpegProcess.kill('SIGTERM');
        logger.debug({ sessionId }, 'ffmpeg process terminated');
      } catch (error) {
        logger.error({ sessionId, error }, 'Error killing ffmpeg process');
      }
      session.ffmpegProcess = null;
    }

    // Clear buffers
    this.bufferStore.clear(sessionId);

    // Update state
    session.state = SESSION_STATES.TERMINATED;

    // Remove from registry
    this.sessions.delete(sessionId);

    logger.info({ sessionId }, 'Session terminated');
  }

  private startIdleTimer(sessionId: string): void {
    const session = this.getSession(sessionId);
    if (!session) {
      return;
    }

    // Clear existing timer
    if (session.idleTimeoutHandle) {
      clearTimeout(session.idleTimeoutHandle);
    }

    // Set new timer
    session.idleTimeoutHandle = setTimeout(() => {
      this.handleIdleTimeout(sessionId);
    }, config.SESSION_IDLE_TIMEOUT);
  }

  private resetIdleTimer(sessionId: string): void {
    this.startIdleTimer(sessionId);
  }

  private handleIdleTimeout(sessionId: string): void {
    const session = this.getSession(sessionId);
    if (!session) {
      return;
    }

    const timeSinceLastAccess = Date.now() - session.lastAccessedAt.getTime();

    if (timeSinceLastAccess >= config.SESSION_IDLE_TIMEOUT) {
      logger.info({ sessionId, timeSinceLastAccess }, 'Session idle timeout, terminating');
      session.state = SESSION_STATES.IDLE;
      this.terminateSession(sessionId);
    } else {
      // Reset timer if session was accessed recently
      this.startIdleTimer(sessionId);
    }
  }

  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleSessions();
    }, config.SESSION_CLEANUP_INTERVAL);

    logger.debug(
      { intervalMs: config.SESSION_CLEANUP_INTERVAL },
      'Cleanup timer started'
    );
  }

  private cleanupIdleSessions(): void {
    const now = Date.now();
    const sessionsToTerminate: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      const timeSinceLastAccess = now - session.lastAccessedAt.getTime();

      if (timeSinceLastAccess >= config.SESSION_IDLE_TIMEOUT) {
        sessionsToTerminate.push(sessionId);
      }
    }

    if (sessionsToTerminate.length > 0) {
      logger.info({ count: sessionsToTerminate.length }, 'Cleaning up idle sessions');

      for (const sessionId of sessionsToTerminate) {
        this.terminateSession(sessionId);
      }
    }
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down SessionManager');

    // Stop cleanup timer
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Terminate all sessions
    const sessionIds = Array.from(this.sessions.keys());
    for (const sessionId of sessionIds) {
      await this.terminateSession(sessionId);
    }

    // Clear all buffers
    this.bufferStore.clearAll();

    logger.info('SessionManager shutdown complete');
  }

  getStats(): {
    sessionCount: number;
    activeCount: number;
    idleCount: number;
    bufferStats: { sessionCount: number; totalFiles: number; totalBytes: number };
  } {
    let activeCount = 0;
    let idleCount = 0;

    for (const session of this.sessions.values()) {
      if (session.state === SESSION_STATES.ACTIVE || session.state === SESSION_STATES.READY) {
        activeCount++;
      } else if (session.state === SESSION_STATES.IDLE) {
        idleCount++;
      }
    }

    return {
      sessionCount: this.sessions.size,
      activeCount,
      idleCount,
      bufferStats: this.bufferStore.getStats(),
    };
  }
}
