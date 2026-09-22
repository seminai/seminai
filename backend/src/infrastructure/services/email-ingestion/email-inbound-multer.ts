import multer, { MulterError } from 'multer';
import { type Request, type Response, type NextFunction } from 'express';
import { DEFAULT_ALLOWED_MIMETYPES, isAllowedMimetype } from '../Multer';

const DEFAULT_MAX_ATTACHMENTS = 20;
const DEFAULT_MAX_PER_FILE_BYTES = 26 * 1024 * 1024;

function resolveLimit(envVar: string, fallback: number): number {
  const raw = process.env[envVar];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? fallback : parsed;
}

/**
 * Multer instance dedicated to the SendGrid Inbound Parse webhook.
 *
 * Differences vs the global `upload`:
 * - in-memory storage (no temp files; the buffer goes to configured storage)
 * - higher file count limit (default 20, configurable via EMAIL_INGEST_MAX_ATTACHMENTS)
 * - permissive allowlist (PDFs, images, CSV/XLS, ZIP, octet-stream)
 * - accepts any field name (SendGrid sends `attachment1`, `attachment2`, ...)
 */
function createEmailInboundUpload(): multer.Multer {
  return multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: resolveLimit('EMAIL_INGEST_MAX_PER_FILE_BYTES', DEFAULT_MAX_PER_FILE_BYTES),
      files: resolveLimit('EMAIL_INGEST_MAX_ATTACHMENTS', DEFAULT_MAX_ATTACHMENTS),
    },
    fileFilter: (_req, file, cb) => {
      if (
        isAllowedMimetype({ mimetype: file.mimetype, allowedMimetypes: DEFAULT_ALLOWED_MIMETYPES })
      ) {
        cb(null, true);
        return;
      }
      cb(null, false);
    },
  });
}

export const emailInboundUpload = createEmailInboundUpload();

/**
 * Express error handler for the email-inbound webhook.
 * SendGrid retries on non-2xx, so we always reply 200 to avoid duplicate processing —
 * but log the multer failure for follow-up.
 */
export function emailInboundMulterErrorHandler(
  err: Error,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (err instanceof MulterError) {
    console.warn(
      '[EmailInbound] Multer error (returning 200 to stop SendGrid retries):',
      err.code,
      err.message,
    );
    res.status(200).json({ status: 'ignored', reason: err.code });
    return;
  }
  next(err);
}
