import { logger } from '../utils/logger';

export class BufferStore {
  private store: Map<string, Map<string, Buffer>>;

  constructor() {
    this.store = new Map();
  }

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
    const sessionStore = this.store.get(sessionId);
    if (!sessionStore) {
      return undefined;
    }

    return sessionStore.get(filename);
  }

  has(sessionId: string, filename?: string): boolean {
    const sessionStore = this.store.get(sessionId);
    if (!sessionStore) {
      return false;
    }

    if (filename === undefined) {
      return true;
    }

    return sessionStore.has(filename);
  }

  clear(sessionId: string): void {
    const sessionStore = this.store.get(sessionId);
    if (sessionStore) {
      const fileCount = sessionStore.size;
      this.store.delete(sessionId);
      logger.info({ sessionId, fileCount }, 'Session buffers cleared');
    }
  }

  clearAll(): void {
    const sessionCount = this.store.size;
    this.store.clear();
    logger.info({ sessionCount }, 'All buffers cleared');
  }

  getSessionFiles(sessionId: string): string[] {
    const sessionStore = this.store.get(sessionId);
    if (!sessionStore) {
      return [];
    }

    return Array.from(sessionStore.keys());
  }

  generateMasterPlaylist(sessionId: string, qualities: string[], bitrates: number[]): string {
    if (qualities.length !== bitrates.length) {
      throw new Error('Qualities and bitrates arrays must have the same length');
    }

    let playlist = '#EXTM3U\n';
    playlist += '#EXT-X-VERSION:3\n';
    playlist += '\n';

    for (let i = 0; i < qualities.length; i++) {
      const quality = qualities[i];
      const bitrate = bitrates[i] * 1000; // Convert kbps to bps

      playlist += `#EXT-X-STREAM-INF:BANDWIDTH=${bitrate},CODECS="mp4a.40.2"\n`;
      playlist += `${quality}/playlist.m3u8\n`;
    }

    // Store the generated master playlist
    this.set(sessionId, 'master.m3u8', Buffer.from(playlist, 'utf-8'));

    return playlist;
  }

  getMemoryUsage(sessionId?: string): number {
    if (sessionId) {
      const sessionStore = this.store.get(sessionId);
      if (!sessionStore) {
        return 0;
      }

      let total = 0;
      for (const buffer of sessionStore.values()) {
        total += buffer.length;
      }
      return total;
    }

    // Total memory usage across all sessions
    let total = 0;
    for (const sessionStore of this.store.values()) {
      for (const buffer of sessionStore.values()) {
        total += buffer.length;
      }
    }
    return total;
  }

  getStats(): { sessionCount: number; totalFiles: number; totalBytes: number } {
    let totalFiles = 0;
    let totalBytes = 0;

    for (const sessionStore of this.store.values()) {
      totalFiles += sessionStore.size;
      for (const buffer of sessionStore.values()) {
        totalBytes += buffer.length;
      }
    }

    return {
      sessionCount: this.store.size,
      totalFiles,
      totalBytes,
    };
  }
}
