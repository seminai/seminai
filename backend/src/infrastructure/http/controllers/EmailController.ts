import { Request, Response } from 'express';
import { EmailService } from '../../services/EmailService';
import { AppError } from '../../../domain/errors/AppError';
import { SendContactEmailUseCase } from '../../../application/use-cases/email/SendContactEmailUseCase';
import { EmailAttachment } from '../../../domain/dtos/contact-email.dto';

export class EmailController {
  constructor(
    private readonly emailService: EmailService,
    private readonly sendContactEmailUseCase: SendContactEmailUseCase,
  ) {}

  async test(request: Request, response: Response): Promise<Response> {
    const { email } = request.body;

    if (!email) {
      throw AppError.badRequest('Email is required', 'MISSING_EMAIL');
    }

    await this.emailService.sendTestEmail(email);

    return response.status(200).json({ status: 'success', message: 'Test email sent' });
  }

  async sendContactEmail(request: Request, response: Response): Promise<Response> {
    const { name, email, body } = request.body;
    const files = request.files as Express.Multer.File[] | undefined;
    const attachments: EmailAttachment[] | undefined =
      files && files.length > 0
        ? files.map((file) => ({
            filename: file.originalname,
            content: file.buffer,
            contentType: file.mimetype,
          }))
        : undefined;
    await this.sendContactEmailUseCase.execute({
      name,
      email,
      body,
      senderIp: request.ip || request.socket.remoteAddress || 'unknown',
      attachments,
    });
    return response
      .status(202)
      .json({ status: 'accepted', message: 'Contact request forwarded successfully' });
  }
}
