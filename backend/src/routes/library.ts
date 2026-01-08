import { Router, Request, Response, NextFunction } from 'express';
import { AudioLibrary } from '../services/AudioLibrary';
import { HTTP_STATUS } from '../config/constants';
import { logger } from '../utils/logger';

export function createLibraryRouter(audioLibrary: AudioLibrary): Router {
  const router = Router();

  // GET /api/library - List all available audio files
  router.get('/', (_req: Request, res: Response, next: NextFunction) => {
    try {
      const files = audioLibrary.getAll();
      const count = audioLibrary.getCount();

      logger.debug({ count }, 'Library listing requested');

      res.status(HTTP_STATUS.OK).json({
        files,
        count,
      });
    } catch (error) {
      next(error);
    }
  });

  // GET /api/library/:id - Get specific audio file info
  router.get('/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const file = audioLibrary.getById(id);

      if (!file) {
        res.status(HTTP_STATUS.NOT_FOUND).json({
          error: 'Not Found',
          message: `Audio file not found: ${id}`,
        });
        return;
      }

      res.status(HTTP_STATUS.OK).json(file);
    } catch (error) {
      next(error);
    }
  });

  // POST /api/library/reload - Reload audio library from disk
  router.post('/reload', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      await audioLibrary.reload();
      const count = audioLibrary.getCount();

      logger.info({ count }, 'Audio library reloaded');

      res.status(HTTP_STATUS.OK).json({
        message: 'Library reloaded successfully',
        count,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
