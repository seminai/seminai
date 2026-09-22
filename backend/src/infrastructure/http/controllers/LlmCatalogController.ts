import type { Request, Response } from 'express';
import { detectLlmProviders } from '../../services/llm/detectLlmProviders';
import { listLlmModels } from '../../services/llm/listLlmModels';

export class LlmCatalogController {
  async detect(_request: Request, response: Response): Promise<Response> {
    const data = await detectLlmProviders();
    return response.json({ status: 'success', data });
  }

  async models(request: Request, response: Response): Promise<Response> {
    const provider = typeof request.query.provider === 'string' ? request.query.provider : undefined;
    const data = await listLlmModels(provider);
    return response.json({ status: 'success', data });
  }
}
