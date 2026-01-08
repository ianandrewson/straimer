import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';
import { HTTP_STATUS } from '../config/constants';
import { logger } from '../utils/logger';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.warn({ path: req.path }, 'Missing or invalid authorization header');
    res.status(HTTP_STATUS.UNAUTHORIZED).json({
      error: 'Unauthorized',
      message: 'Missing or invalid authorization header',
    });
    return;
  }

  const token = authHeader.substring(7);

  if (!config.API_KEY) {
    logger.error('API_KEY not configured');
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Internal Server Error',
      message: 'Server configuration error',
    });
    return;
  }

  if (token !== config.API_KEY) {
    logger.warn({ path: req.path }, 'Invalid API key');
    res.status(HTTP_STATUS.UNAUTHORIZED).json({
      error: 'Unauthorized',
      message: 'Invalid API key',
    });
    return;
  }

  next();
}
