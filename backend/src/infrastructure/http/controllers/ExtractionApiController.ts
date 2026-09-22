import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { RegisterExtractionApiUserUseCase } from '../../../application/use-cases/extraction-api/RegisterExtractionApiUserUseCase';
import { GetExtractionApiAccountUseCase } from '../../../application/use-cases/extraction-api/GetExtractionApiAccountUseCase';
import { EnsureExtractionApiAccountUseCase } from '../../../application/use-cases/extraction-api/EnsureExtractionApiAccountUseCase';
import { CreateExtractionApiKeyUseCase } from '../../../application/use-cases/extraction-api/CreateExtractionApiKeyUseCase';
import { ListExtractionApiKeysUseCase } from '../../../application/use-cases/extraction-api/ListExtractionApiKeysUseCase';
import { RevokeExtractionApiKeyUseCase } from '../../../application/use-cases/extraction-api/RevokeExtractionApiKeyUseCase';
import { ListExtractionApiUsageUseCase } from '../../../application/use-cases/extraction-api/ListExtractionApiUsageUseCase';
import { ExtractDocumentApiUseCase } from '../../../application/use-cases/extraction-api/ExtractDocumentApiUseCase';
import type { ExtractionApiDocumentType } from '../../../domain/dtos/extraction-api.dto';

export class ExtractionApiController {
  constructor(
    private readonly registerUseCase: RegisterExtractionApiUserUseCase,
    private readonly accountUseCase: GetExtractionApiAccountUseCase,
    private readonly ensureAccountUseCase: EnsureExtractionApiAccountUseCase,
    private readonly createKeyUseCase: CreateExtractionApiKeyUseCase,
    private readonly listKeysUseCase: ListExtractionApiKeysUseCase,
    private readonly revokeKeyUseCase: RevokeExtractionApiKeyUseCase,
    private readonly listUsageUseCase: ListExtractionApiUsageUseCase,
    private readonly extractUseCase: ExtractDocumentApiUseCase,
  ) {}

  async register(request: Request, response: Response): Promise<Response> {
    const { email, password, name, inviteCode } = request.body as {
      email?: string;
      password?: string;
      name?: string;
      inviteCode?: string;
    };
    if (!email || !password || !name || !inviteCode) {
      throw AppError.badRequest(
        'Missing required fields: email, password, name, inviteCode',
        'MISSING_FIELDS',
      );
    }
    const user = await this.registerUseCase.execute({ email, password, name, inviteCode });
    const account = await this.accountUseCase.execute(user.id);
    return response.status(201).json({
      status: 'success',
      data: {
        user: { id: user.id, email: user.email, name: user.name },
        account,
      },
    });
  }

  async getAccount(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUserId(request);
    const account = await this.ensureAccountUseCase.execute(userId);
    return response.json({ status: 'success', data: { account } });
  }

  async createApiKey(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUserId(request);
    const name = String((request.body as { name?: string })?.name ?? '').trim();
    const created = await this.createKeyUseCase.execute({ userId, name });
    return response.status(201).json({ status: 'success', data: created });
  }

  async listApiKeys(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUserId(request);
    const keys = await this.listKeysUseCase.execute(userId);
    return response.json({ status: 'success', data: { keys } });
  }

  async revokeApiKey(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUserId(request);
    const keyId = String(request.params.id ?? '');
    const key = await this.revokeKeyUseCase.execute({ userId, keyId });
    return response.json({ status: 'success', data: { key } });
  }

  async listUsage(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUserId(request);
    const page = Number.parseInt(String(request.query.page ?? '1'), 10);
    const pageSize = Number.parseInt(String(request.query.pageSize ?? '20'), 10);
    const usage = await this.listUsageUseCase.execute({ userId, page, pageSize });
    return response.json({ status: 'success', data: usage });
  }

  async extractDocument(request: Request, response: Response): Promise<Response> {
    const auth = request.extractionApiAuth;
    if (!auth) {
      throw AppError.unauthorized('API key authentication required', 'MISSING_API_KEY');
    }
    const file = request.file;
    if (!file) {
      throw AppError.badRequest('Missing file upload', 'MISSING_FILE');
    }
    const documentType = this.parseDocumentType(
      (request.body as { documentType?: string })?.documentType,
    );
    const result = await this.extractUseCase.execute({
      userId: auth.userId,
      apiKeyId: auth.apiKeyId,
      fileBuffer: file.buffer,
      fileName: file.originalname,
      mimeType: file.mimetype,
      documentType,
    });
    return response.json({ status: 'success', data: result });
  }

  private requireUserId(request: Request): string {
    const userId = request.user?.id;
    if (!userId) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    return userId;
  }

  private parseDocumentType(raw: string | undefined): ExtractionApiDocumentType {
    if (raw === 'invoice' || raw === 'ddt' || raw === 'auto') {
      return raw;
    }
    throw AppError.badRequest(
      'documentType must be invoice, ddt, or auto',
      'INVALID_DOCUMENT_TYPE',
    );
  }
}
