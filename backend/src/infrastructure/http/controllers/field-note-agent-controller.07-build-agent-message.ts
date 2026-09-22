import { Request } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { MulterFile } from '../../services/Multer';
import type { FieldNoteAgentControllerContext } from './field-note-agent-controller.context';

export async function fieldNoteAgentControllerBuildAgentMessage(this: FieldNoteAgentControllerContext, req: Request, message: string | undefined): Promise<string> {
    const file = req.file as MulterFile | undefined;
    const baseMessage = message?.trim();
    if (!file) {
      if (!baseMessage) {
        throw AppError.badRequest(
          'Message is required and must be a non-empty string',
          'INVALID_MESSAGE',
        );
      }
      return baseMessage;
    }
    const uploadedUrl = await this.uploadAgentFile(req.user!.id, file, req.body?.type as string);
    const messagePrefix = baseMessage ? `${baseMessage}\n\n` : '';
    const attachmentContext = await this.extractAttachmentContext(uploadedUrl, file.mimetype);
    const contextSuffix = attachmentContext ? `\n\n${attachmentContext}` : '';
    return `${messagePrefix}Attachment URL: ${uploadedUrl}\nAttachment Name: ${file.originalname}\nAttachment Type: ${file.mimetype}${contextSuffix}`;
  }
