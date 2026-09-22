import { Router } from 'express';
import { buildPublicRuntimeConfig } from '../../runtime/publicRuntimeConfig';

const publicConfigRouter = Router();

/** Public, non-secret capability discovery for the local UI. */
publicConfigRouter.get('/config/public', (_request, response) => {
  return response.json({
    status: 'success',
    data: buildPublicRuntimeConfig(),
  });
});

export { publicConfigRouter };
