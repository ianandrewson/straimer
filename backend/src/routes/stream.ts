import { Router, Request, Response, NextFunction } from 'express';
import { SessionManager } from '../services/SessionManager';
import { BufferStore } from '../services/BufferStore';
import { validateSessionId } from '../utils/validation';
import { NotFoundError } from '../middleware/error';
import { HTTP_STATUS, MIME_TYPES, SESSION_STATES } from '../config/constants';
import { logger } from '../utils/logger';

export function createStreamRouter(
  sessionManager: SessionManager,
  bufferStore: BufferStore
): Router {
  const router = Router();

  // GET /stream/:sessionId/master.m3u8 - Serve master playlist
  router.get('/:sessionId/master.m3u8', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sessionId } = req.params;
      validateSessionId(sessionId);

      // Check if session exists
      const session = sessionManager.getSession(sessionId);
      if (!session) {
        throw new NotFoundError(`Session not found: ${sessionId}`);
      }

      // Check if session is ready
      if (session.state === SESSION_STATES.INITIALIZING) {
        res.status(HTTP_STATUS.NOT_FOUND).json({
          error: 'Not Ready',
          message: 'Session is still initializing, please retry in a moment',
          sessionId,
          status: session.state,
        });
        return;
      }

      if (session.state === SESSION_STATES.TERMINATED) {
        throw new NotFoundError(`Session has been terminated: ${sessionId}`);
      }

      // Update last accessed time
      sessionManager.updateLastAccessed(sessionId);

      // Get master playlist from buffer
      const masterPlaylist = bufferStore.get(sessionId, 'master.m3u8');

      if (!masterPlaylist) {
        throw new NotFoundError(`Master playlist not found for session: ${sessionId}`);
      }

      logger.debug({ sessionId }, 'Serving master playlist');

      res.setHeader('Content-Type', MIME_TYPES.HLS_PLAYLIST);
      res.setHeader('Cache-Control', 'no-cache');
      res.status(HTTP_STATUS.OK).send(masterPlaylist);
    } catch (error) {
      next(error);
    }
  });

  // GET /stream/:sessionId/:quality/playlist.m3u8 - Serve variant playlist
  router.get(
    '/:sessionId/:quality/playlist.m3u8',
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const { sessionId, quality } = req.params;
        validateSessionId(sessionId);

        // Check if session exists
        const session = sessionManager.getSession(sessionId);
        if (!session) {
          throw new NotFoundError(`Session not found: ${sessionId}`);
        }

        // Check if session is ready
        if (session.state === SESSION_STATES.INITIALIZING) {
          res.status(HTTP_STATUS.NOT_FOUND).json({
            error: 'Not Ready',
            message: 'Session is still initializing, please retry in a moment',
            sessionId,
            status: session.state,
          });
          return;
        }

        if (session.state === SESSION_STATES.TERMINATED) {
          throw new NotFoundError(`Session has been terminated: ${sessionId}`);
        }

        // Update last accessed time
        sessionManager.updateLastAccessed(sessionId);

        // Get variant playlist from buffer
        const playlistKey = `${quality}/playlist.m3u8`;
        const playlist = bufferStore.get(sessionId, playlistKey);

        if (!playlist) {
          throw new NotFoundError(
            `Playlist not found for session ${sessionId}, quality ${quality}`
          );
        }

        logger.debug({ sessionId, quality }, 'Serving variant playlist');

        res.setHeader('Content-Type', MIME_TYPES.HLS_PLAYLIST);
        res.setHeader('Cache-Control', 'no-cache');
        res.status(HTTP_STATUS.OK).send(playlist);
      } catch (error) {
        next(error);
      }
    }
  );

  // GET /stream/:sessionId/:quality/:segment - Serve segment file
  router.get(
    '/:sessionId/:quality/:segment',
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const { sessionId, quality, segment } = req.params;
        validateSessionId(sessionId);

        // Check if session exists
        const session = sessionManager.getSession(sessionId);
        if (!session) {
          throw new NotFoundError(`Session not found: ${sessionId}`);
        }

        // Check if session is ready
        if (session.state === SESSION_STATES.INITIALIZING) {
          res.status(HTTP_STATUS.NOT_FOUND).json({
            error: 'Not Ready',
            message: 'Session is still initializing, please retry in a moment',
            sessionId,
            status: session.state,
          });
          return;
        }

        if (session.state === SESSION_STATES.TERMINATED) {
          throw new NotFoundError(`Session has been terminated: ${sessionId}`);
        }

        // Update last accessed time
        sessionManager.updateLastAccessed(sessionId);

        // Get segment from buffer
        const segmentKey = `${quality}/${segment}`;
        const segmentBuffer = bufferStore.get(sessionId, segmentKey);

        if (!segmentBuffer) {
          logger.warn({ sessionId, quality, segment }, 'Segment not found');
          throw new NotFoundError(
            `Segment not found for session ${sessionId}: ${segmentKey}`
          );
        }

        logger.debug({ sessionId, quality, segment, size: segmentBuffer.length }, 'Serving segment');

        res.setHeader('Content-Type', MIME_TYPES.MPEG_TS);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.status(HTTP_STATUS.OK).send(segmentBuffer);
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
