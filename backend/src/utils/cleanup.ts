import { Server } from 'http';
import { SessionManager } from '../services/SessionManager';
import { logger } from './logger';

export async function setupGracefulShutdown(
  server: Server,
  sessionManager: SessionManager
): Promise<void> {
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Received shutdown signal');

    // Stop accepting new connections
    server.close(() => {
      logger.info('HTTP server closed');
    });

    try {
      // Shutdown session manager (terminates all sessions, clears buffers)
      await sessionManager.shutdown();

      logger.info('Graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error({ error }, 'Error during shutdown');
      process.exit(1);
    }

    // Force shutdown after timeout
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.fatal({ error }, 'Uncaught exception');
    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.fatal({ reason, promise }, 'Unhandled promise rejection');
    process.exit(1);
  });
}
