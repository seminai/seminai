import { createHash } from 'node:crypto';
import { Request } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { FileService } from '../../services/FileService';
import { MulterFile } from '../../services/Multer';
import { requireAuthenticatedUserId } from './controller-auth';

export type UploadedRulePdf = Readonly<{
  url: string;
  fileName: string;
  hash: string;
}>;

export const uploadRulePdf = async (request: Request): Promise<UploadedRulePdf | null> => {
  const file = (request as Request & { file?: MulterFile }).file;
  if (!file) return null;
  if (file.mimetype !== 'application/pdf') {
    throw AppError.badRequest(
      'Only PDF files are allowed for rule documents',
      'INVALID_FILE_TYPE',
    );
  }
  const maxSizeBytes = 50 * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    throw AppError.badRequest('PDF file exceeds maximum size of 50MB', 'FILE_TOO_LARGE');
  }
  const userId = requireAuthenticatedUserId(request);
  const url = await new FileService(userId).uploadFile(file, userId, 'rules/pdfs', 'rule_pdf');
  const hash = createHash('sha256').update(new Uint8Array(file.buffer)).digest('hex');
  return { url, fileName: file.originalname, hash };
};

export const parseRuleContent = (content: unknown): unknown => {
  if (!content) return null;
  if (typeof content === 'object') return content;
  if (typeof content !== 'string') return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
};

export const parseOptionalBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
};
