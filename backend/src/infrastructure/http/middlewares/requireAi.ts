import type { RequestHandler } from 'express';
import { requireAiEnabled } from '../../runtime/aiCapabilities';

/** Reject before queueing or constructing a model. */
export const requireAi: RequestHandler = (_request, _response, next) => {
  try {
    requireAiEnabled();
    next();
  } catch (error) {
    next(error);
  }
};
