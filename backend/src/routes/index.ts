import { Router } from 'express';
import { SessionManager } from '../services/SessionManager';
import { BufferStore } from '../services/BufferStore';
import { AudioLibrary } from '../services/AudioLibrary';
import { createSessionRouter } from './session';
import { createLibraryRouter } from './library';
import { createStreamRouter } from './stream';
import { authMiddleware } from '../middleware/auth';

export function createRouter(
  sessionManager: SessionManager,
  bufferStore: BufferStore,
  audioLibrary: AudioLibrary
): Router {
  const router = Router();

  // API routes (protected by auth)
  router.use('/api/sessions', authMiddleware, createSessionRouter(sessionManager));
  router.use('/api/library', authMiddleware, createLibraryRouter(audioLibrary));

  // Stream routes (protected by auth)
  router.use('/stream', authMiddleware, createStreamRouter(sessionManager, bufferStore));

  return router;
}
