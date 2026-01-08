import Joi from 'joi';
import { ValidationError } from '../middleware/error';

export const createSessionSchema = Joi.object({
  audioFileId: Joi.string().required().min(1).max(256),
  qualities: Joi.array().items(Joi.string()).optional(),
});

export const sessionIdSchema = Joi.string().required().pattern(/^sess_[a-f0-9-]+$/);

export function validateCreateSession(data: unknown): {
  audioFileId: string;
  qualities?: string[];
} {
  const { error, value } = createSessionSchema.validate(data);

  if (error) {
    throw new ValidationError(`Invalid request: ${error.message}`);
  }

  return value;
}

export function validateSessionId(sessionId: string): void {
  const { error } = sessionIdSchema.validate(sessionId);

  if (error) {
    throw new ValidationError('Invalid session ID format');
  }
}
