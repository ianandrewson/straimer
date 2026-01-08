import { promises as fs } from 'fs';
import { AudioFile, AudioLibraryData } from '../models/AudioFile';
import { logger } from '../utils/logger';
import { config } from '../config/env';

export class AudioLibrary {
  private library: AudioFile[] = [];
  private libraryPath: string;

  constructor(libraryPath?: string) {
    this.libraryPath = libraryPath || config.AUDIO_LIBRARY_PATH;
  }

  async load(): Promise<void> {
    try {
      logger.info({ path: this.libraryPath }, 'Loading audio library');
      const data = await fs.readFile(this.libraryPath, 'utf-8');
      const parsed: AudioLibraryData = JSON.parse(data);

      if (!parsed.files || !Array.isArray(parsed.files)) {
        throw new Error('Invalid audio library format: missing or invalid "files" array');
      }

      this.library = parsed.files;
      logger.info({ count: this.library.length }, 'Audio library loaded');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.warn({ path: this.libraryPath }, 'Audio library file not found, starting with empty library');
        this.library = [];
      } else {
        logger.error({ error, path: this.libraryPath }, 'Failed to load audio library');
        throw error;
      }
    }
  }

  getById(id: string): AudioFile | undefined {
    return this.library.find((file) => file.id === id);
  }

  getAll(): AudioFile[] {
    return [...this.library];
  }

  async validate(id: string): Promise<boolean> {
    const file = this.getById(id);
    if (!file) {
      return false;
    }

    try {
      await fs.access(file.path);
      return true;
    } catch {
      logger.warn({ id, path: file.path }, 'Audio file not accessible');
      return false;
    }
  }

  async reload(): Promise<void> {
    await this.load();
  }

  getCount(): number {
    return this.library.length;
  }
}
