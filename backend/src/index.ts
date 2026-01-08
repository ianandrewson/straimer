import express from 'express';
import pinoHttp from 'pino-http';
import { config } from './config/env';
import { logger } from './utils/logger';
import { HTTP_STATUS } from './config/constants';

const app = express();

// Middleware
app.use(express.json());
app.use(pinoHttp({ logger }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(HTTP_STATUS.OK).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Start server
const server = app.listen(config.PORT, () => {
  logger.info(
    {
      port: config.PORT,
      nodeEnv: config.NODE_ENV,
    },
    'Server started'
  );
});

// Graceful shutdown
const shutdown = () => {
  logger.info('Shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
