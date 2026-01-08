import { BufferStore } from '../src/services/BufferStore';
import { AudioLibrary } from '../src/services/AudioLibrary';
import { FfmpegManager } from '../src/services/FfmpegManager';
import { SessionManager } from '../src/services/SessionManager';
import { logger } from '../src/utils/logger';

async function testFfmpeg() {
  logger.info('Starting ffmpeg integration test');

  // Initialize services
  const bufferStore = new BufferStore();
  const audioLibrary = new AudioLibrary('./data/audio-library.json');
  const ffmpegManager = new FfmpegManager(bufferStore);
  const sessionManager = new SessionManager(bufferStore, audioLibrary, ffmpegManager);

  try {
    // Initialize session manager (loads audio library)
    await sessionManager.initialize();

    // Create a session
    logger.info('Creating test session');
    const sessionId = await sessionManager.createSession('test-001');
    logger.info({ sessionId }, 'Session created');

    // Wait a bit for ffmpeg to start and generate some segments
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Check session status
    const sessionInfo = sessionManager.getSessionInfo(sessionId);
    logger.info({ sessionInfo }, 'Session info');

    // Check buffer store stats
    const stats = bufferStore.getStats();
    logger.info({ stats }, 'Buffer store stats');

    // List files in buffer
    const files = bufferStore.getSessionFiles(sessionId);
    logger.info({ sessionId, fileCount: files.length, files: files.slice(0, 10) }, 'Session files');

    // Check if master playlist exists
    const masterPlaylist = bufferStore.get(sessionId, 'master.m3u8');
    if (masterPlaylist) {
      logger.info({ content: masterPlaylist.toString() }, 'Master playlist');
    }

    // Wait a bit more
    logger.info('Waiting 5 more seconds to collect more segments...');
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Final stats
    const finalStats = bufferStore.getStats();
    logger.info({ stats: finalStats }, 'Final buffer store stats');

    const finalFiles = bufferStore.getSessionFiles(sessionId);
    logger.info(
      { sessionId, fileCount: finalFiles.length, files: finalFiles },
      'Final session files'
    );

    // Terminate session
    logger.info({ sessionId }, 'Terminating session');
    await sessionManager.terminateSession(sessionId);

    logger.info('Test completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Test failed');
    process.exit(1);
  }
}

testFfmpeg();
