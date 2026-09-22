import { type Request, type Response } from 'express';
import { type ProcessInboundEmailUseCase } from '../../../application/use-cases/email-inbound/ProcessInboundEmailUseCase';
import { SendgridInboundParser } from '../../services/email-ingestion/SendgridInboundParser';

/**
 * Thin controller for the SendGrid Inbound Parse webhook.
 *
 * Always replies 200 OK (apart from the 401 produced by the auth middleware)
 * so SendGrid does not retry on application errors — those are persisted
 * via the EmailIngestion FAILED status instead.
 */
export class EmailInboundWebhookController {
  private readonly parser = new SendgridInboundParser();

  constructor(private readonly processInboundEmailUseCase: ProcessInboundEmailUseCase) {}

  async handle(request: Request, response: Response): Promise<Response> {
    try {
      const parsed = this.parser.parse(request);
      const result = await this.processInboundEmailUseCase.execute(parsed);
      console.log(
        `[EmailInbound] ${parsed.messageId} → ${result.outcome}` +
          (result.ingestionId ? ` (ingestion=${result.ingestionId})` : '') +
          (result.threadId ? ` (thread=${result.threadId})` : ''),
      );
      return response.status(200).json({ status: 'ok', outcome: result.outcome });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      console.error('[EmailInbound] Processing failed:', message, error);
      return response.status(200).json({ status: 'error', message });
    }
  }
}
