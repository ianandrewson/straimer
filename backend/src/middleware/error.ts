import { Request, Response, NextFunction } from 'express';
import { HTTP_STATUS } from '../config/constants';
import { logger } from '../utils/logger';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  logger.error(
    {
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    },
    'Request error'
  );

  if (err instanceof ValidationError) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Validation Error',
      message: err.message,
    });
    return;
  }

  if (err instanceof NotFoundError) {
    res.status(HTTP_STATUS.NOT_FOUND).json({
      error: 'Not Found',
      message: err.message,
    });
    return;
  }

  if (err instanceof UnauthorizedError) {
    res.status(HTTP_STATUS.UNAUTHORIZED).json({
      error: 'Unauthorized',
      message: err.message,
    });
    return;
  }

  // Default to 500 Internal Server Error
  res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred',
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  logger.warn({ path: req.path, method: req.method }, 'Route not found');
  res.status(HTTP_STATUS.NOT_FOUND).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
  });
}
