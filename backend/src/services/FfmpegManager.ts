import { spawn, ChildProcess } from 'child_process';
import { promises as fs, watch, FSWatcher } from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { BufferStore } from './BufferStore';
import { logger } from '../utils/logger';
import { config } from '../config/env';

interface FfmpegOptions {
  sessionId: string;
  audioFilePath: string;
  qualities: string[];
  bitrates: number[];
}

export class FfmpegManager {
  private bufferStore: BufferStore;
  private watchers: Map<string, FSWatcher[]>;

  constructor(bufferStore: BufferStore) {
    this.bufferStore = bufferStore;
    this.watchers = new Map();
  }

  async spawn(options: FfmpegOptions): Promise<ChildProcess> {
    const { sessionId, audioFilePath, qualities, bitrates } = options;

    if (qualities.length !== bitrates.length) {
      throw new Error('Qualities and bitrates arrays must have the same length');
    }

    // Create temporary directory for this session
    const tempDir = path.join(tmpdir(), `straimer-${sessionId}`);
    await fs.mkdir(tempDir, { recursive: true });

    logger.info(
      {
        sessionId,
        audioFilePath,
        qualities,
        bitrates,
        tempDir,
      },
      'Spawning ffmpeg process'
    );

    // Build ffmpeg arguments
    const args = this.buildFfmpegArgs(audioFilePath, qualities, bitrates, tempDir);

    // Spawn ffmpeg process
    const ffmpegProcess = spawn('ffmpeg', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Handle stdout
    ffmpegProcess.stdout?.on('data', (data) => {
      logger.debug({ sessionId, data: data.toString() }, 'ffmpeg stdout');
    });

    // Handle stderr (ffmpeg outputs progress here)
    ffmpegProcess.stderr?.on('data', (data) => {
      const message = data.toString();
      logger.debug({ sessionId, message }, 'ffmpeg stderr');
    });

    // Handle process exit
    ffmpegProcess.on('exit', (code, signal) => {
      logger.info({ sessionId, code, signal }, 'ffmpeg process exited');
      this.cleanup(sessionId, tempDir);
    });

    // Handle process errors
    ffmpegProcess.on('error', (error) => {
      logger.error({ sessionId, error }, 'ffmpeg process error');
      this.cleanup(sessionId, tempDir);
    });

    // Set up file watchers for each quality level
    await this.setupFileWatchers(sessionId, tempDir, qualities);

    return ffmpegProcess;
  }

  private buildFfmpegArgs(
    inputPath: string,
    qualities: string[],
    bitrates: number[],
    outputDir: string
  ): string[] {
    const args: string[] = [
      '-i',
      inputPath,
      '-preset',
      'ultrafast',
      '-threads',
      '2',
    ];

    // Add output for each quality level
    for (let i = 0; i < qualities.length; i++) {
      const quality = qualities[i];
      const bitrate = bitrates[i];
      const outputPath = path.join(outputDir, quality);

      args.push(
        // Map audio stream
        '-map',
        '0:a',
        // Audio codec and bitrate
        '-c:a',
        'aac',
        '-b:a',
        `${bitrate}k`,
        // HLS options
        '-f',
        'hls',
        '-hls_time',
        config.HLS_SEGMENT_DURATION.toString(),
        '-hls_list_size',
        '0', // Keep all segments in playlist
        '-hls_segment_type',
        'mpegts',
        '-hls_segment_filename',
        `${outputPath}/segment%d.ts`,
        '-hls_playlist_type',
        'event', // VOD-style playlist
        // Output playlist
        `${outputPath}/playlist.m3u8`
      );
    }

    return args;
  }

  private async setupFileWatchers(
    sessionId: string,
    tempDir: string,
    qualities: string[]
  ): Promise<void> {
    const watchers: FSWatcher[] = [];

    for (const quality of qualities) {
      const qualityDir = path.join(tempDir, quality);

      // Create quality directory
      await fs.mkdir(qualityDir, { recursive: true });

      // Watch for new files
      const watcher = watch(qualityDir, async (eventType, filename) => {
        if (!filename) return;

        const filePath = path.join(qualityDir, filename);

        try {
          // Wait a bit to ensure file is fully written
          await new Promise((resolve) => setTimeout(resolve, 100));

          // Check if file still exists and is readable
          const stats = await fs.stat(filePath);
          if (!stats.isFile()) return;

          // Read file into buffer
          const buffer = await fs.readFile(filePath);

          // Store in BufferStore with quality prefix
          const storageKey = `${quality}/${filename}`;
          this.bufferStore.set(sessionId, storageKey, buffer);

          logger.debug(
            {
              sessionId,
              filename: storageKey,
              size: buffer.length,
            },
            'File captured to buffer'
          );

          // Delete the temporary file
          await fs.unlink(filePath).catch((err) => {
            logger.warn({ sessionId, filePath, err }, 'Failed to delete temp file');
          });
        } catch (error) {
          // File might have been deleted already or not ready yet
          logger.debug({ sessionId, filename, error }, 'Error reading temp file');
        }
      });

      watchers.push(watcher);
    }

    this.watchers.set(sessionId, watchers);
  }

  private async cleanup(sessionId: string, tempDir: string): Promise<void> {
    logger.debug({ sessionId, tempDir }, 'Cleaning up ffmpeg resources');

    // Close file watchers
    const watchers = this.watchers.get(sessionId);
    if (watchers) {
      for (const watcher of watchers) {
        watcher.close();
      }
      this.watchers.delete(sessionId);
    }

    // Remove temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
      logger.debug({ sessionId, tempDir }, 'Temporary directory removed');
    } catch (error) {
      logger.warn({ sessionId, tempDir, error }, 'Failed to remove temporary directory');
    }
  }

  async killProcess(sessionId: string, process: ChildProcess): Promise<void> {
    logger.info({ sessionId, pid: process.pid }, 'Killing ffmpeg process');

    return new Promise((resolve) => {
      if (!process.pid) {
        resolve();
        return;
      }

      process.once('exit', () => {
        logger.debug({ sessionId }, 'ffmpeg process killed');
        resolve();
      });

      // Try graceful termination first
      process.kill('SIGTERM');

      // Force kill after timeout
      setTimeout(() => {
        if (process.exitCode === null) {
          logger.warn({ sessionId }, 'Force killing ffmpeg process');
          process.kill('SIGKILL');
        }
      }, 5000);
    });
  }
}
