import { Router, Request, Response, NextFunction } from 'express';
import { SessionManager } from '../services/SessionManager';
import { validateCreateSession, validateSessionId } from '../utils/validation';
import { ValidationError, NotFoundError } from '../middleware/error';
import { HTTP_STATUS } from '../config/constants';
import { logger } from '../utils/logger';

export function createSessionRouter(sessionManager: SessionManager): Router {
  const router = Router();

  // POST /api/sessions - Create new session
  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { audioFileId, qualities } = validateCreateSession(req.body);

      logger.info({ audioFileId, qualities }, 'Creating session');

      const sessionId = await sessionManager.createSession(audioFileId, qualities);
      const sessionInfo = sessionManager.getSessionInfo(sessionId);

      if (!sessionInfo) {
        throw new Error('Failed to retrieve session info after creation');
      }

      res.status(HTTP_STATUS.CREATED).json({
        sessionId: sessionInfo.sessionId,
        masterPlaylistUrl: `/stream/${sessionId}/master.m3u8`,
        status: sessionInfo.status,
        createdAt: sessionInfo.createdAt,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        next(new ValidationError(error.message));
      } else if (error instanceof Error && error.message.includes('not accessible')) {
        next(new ValidationError(error.message));
      } else {
        next(error);
      }
    }
  });

  // GET /api/sessions/:sessionId - Get session status
  router.get('/:sessionId', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sessionId } = req.params;
      validateSessionId(sessionId);

      const sessionInfo = sessionManager.getSessionInfo(sessionId);

      if (!sessionInfo) {
        throw new NotFoundError(`Session not found: ${sessionId}`);
      }

      res.status(HTTP_STATUS.OK).json(sessionInfo);
    } catch (error) {
      next(error);
    }
  });

  // GET /api/sessions - List all sessions
  router.get('/', (_req: Request, res: Response, next: NextFunction) => {
    try {
      const sessions = sessionManager.getAllSessions();
      const stats = sessionManager.getStats();

      res.status(HTTP_STATUS.OK).json({
        sessions,
        stats,
      });
    } catch (error) {
      next(error);
    }
  });

  // DELETE /api/sessions/:sessionId - Terminate session
  router.delete('/:sessionId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sessionId } = req.params;
      validateSessionId(sessionId);

      const sessionInfo = sessionManager.getSessionInfo(sessionId);

      if (!sessionInfo) {
        throw new NotFoundError(`Session not found: ${sessionId}`);
      }

      await sessionManager.terminateSession(sessionId);

      logger.info({ sessionId }, 'Session terminated via API');

      res.status(HTTP_STATUS.OK).json({
        sessionId,
        status: 'terminated',
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
