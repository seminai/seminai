import type { Request, Response } from 'express';
import { CompleteSetupUseCase } from '../../../application/use-cases/setup/CompleteSetupUseCase';
import { GetSetupStatusUseCase } from '../../../application/use-cases/setup/GetSetupStatusUseCase';
import { detectOllama } from '../../settings/ollamaDetect';
import { getSessionCookieOptions } from '../utils/admin-access';
import type { CompleteSetupInput } from '../../../application/use-cases/setup/setupTypes';

const AUTH_COOKIE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export class SetupController {
  constructor(
    private readonly getStatus: GetSetupStatusUseCase,
    private readonly completeSetup: CompleteSetupUseCase,
  ) {}

  async status(_request: Request, response: Response): Promise<Response> {
    const data = await this.getStatus.execute();
    return response.json({ status: 'success', data });
  }

  async detect(_request: Request, response: Response): Promise<Response> {
    const data = await detectOllama();
    return response.json({ status: 'success', data });
  }

  async complete(request: Request, response: Response): Promise<Response> {
    const result = await this.completeSetup.execute(request.body as CompleteSetupInput);
    response.cookie('auth_token', result.token, getSessionCookieOptions(request, AUTH_COOKIE_MAX_AGE_MS));
    return response.status(201).json({ status: 'success', data: result });
  }
}
