import express from 'express';
import { config } from './config/env';
import { logger } from './utils/logger';
import { requestLogger } from './middleware/logger';
import { errorHandler, notFoundHandler } from './middleware/error';
import { HTTP_STATUS } from './config/constants';
import { BufferStore } from './services/BufferStore';
import { AudioLibrary } from './services/AudioLibrary';
import { FfmpegManager } from './services/FfmpegManager';
import { SessionManager } from './services/SessionManager';
import { createRouter } from './routes';
import { setupGracefulShutdown } from './utils/cleanup';

async function main() {
  logger.info('Starting Straimer backend');

  // Initialize services
  const bufferStore = new BufferStore();
  const audioLibrary = new AudioLibrary();
  const ffmpegManager = new FfmpegManager(bufferStore);
  const sessionManager = new SessionManager(bufferStore, audioLibrary, ffmpegManager);

  // Initialize session manager (loads audio library)
  await sessionManager.initialize();

  // Create Express app
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(requestLogger);

  // Health check endpoint (public)
  app.get('/health', (_req, res) => {
    const stats = sessionManager.getStats();
    res.status(HTTP_STATUS.OK).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      sessions: stats.sessionCount,
      activeStreams: stats.activeCount,
    });
  });

  // API routes
  app.use(createRouter(sessionManager, bufferStore, audioLibrary));

  // Error handlers (must be last)
  app.use(notFoundHandler);
  app.use(errorHandler);

  // Start server
  const server = app.listen(config.PORT, () => {
    logger.info(
      {
        port: config.PORT,
        nodeEnv: config.NODE_ENV,
        apiKeyConfigured: !!config.API_KEY,
      },
      'Server started'
    );
  });

  // Setup graceful shutdown
  await setupGracefulShutdown(server, sessionManager);

  logger.info('Straimer backend ready');
}

// Start the application
main().catch((error) => {
  logger.fatal({ error }, 'Failed to start application');
  process.exit(1);
});
