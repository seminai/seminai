import multer, { MulterError } from 'multer';
import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';

export interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
  destination?: string;
  filename?: string;
  path?: string;
}

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
const UPLOAD_DIR = path.join(os.tmpdir(), 'seminai-uploads');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export const DEFAULT_ALLOWED_MIMETYPES = new Set([
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
  'application/geo+json',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'application/xml',
  'text/xml',
]);

export const AUDIO_ALLOWED_MIMETYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/mpga',
  'audio/m4a',
  'audio/x-m4a',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/webm',
]);

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

export function isAllowedMimetype({
  mimetype,
  allowedMimetypes,
}: {
  mimetype: string;
  allowedMimetypes: ReadonlySet<string>;
}): boolean {
  return allowedMimetypes.has(mimetype.toLowerCase());
}

function createUpload(allowedMimetypes: ReadonlySet<string>) {
  return multer({
    storage,
    limits: {
      fileSize: MAX_FILE_SIZE_BYTES,
      files: 10,
    },
    fileFilter: (_req, file, cb) => {
      if (isAllowedMimetype({ mimetype: file.mimetype, allowedMimetypes })) {
        cb(null, true);
        return;
      }
      cb(new MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
    },
  });
}

/**
 * Post-upload middleware: reads disk files into buffer for backward compatibility
 * and schedules temp file cleanup on response finish.
 */
export function loadBuffersAndCleanup(req: Request, res: Response, next: NextFunction): void {
  const files: Express.Multer.File[] = [];
  if (req.file) files.push(req.file);
  if (Array.isArray(req.files)) files.push(...req.files);

  // Read disk files into buffers so existing consumers can use file.buffer
  for (const file of files) {
    if (file.path && !file.buffer) {
      file.buffer = fs.readFileSync(file.path);
    }
  }

  // Clean up temp files when response is done
  res.on('finish', () => {
    for (const file of files) {
      if (file.path) {
        fs.unlink(file.path, () => {});
      }
    }
  });

  next();
}

type MiddlewareChain = Array<(req: Request, res: Response, next: NextFunction) => void>;

interface WrappedMulter {
  single(fieldName: string): MiddlewareChain;
  array(fieldName: string, maxCount?: number): MiddlewareChain;
  fields(fields: readonly multer.Field[]): MiddlewareChain;
  any(): MiddlewareChain;
}

function wrapWithCleanup(instance: multer.Multer): WrappedMulter {
  return {
    single: (fieldName) => [instance.single(fieldName), loadBuffersAndCleanup],
    array: (fieldName, maxCount?) => [instance.array(fieldName, maxCount!), loadBuffersAndCleanup],
    fields: (fields) => [instance.fields(fields as multer.Field[]), loadBuffersAndCleanup],
    any: () => [instance.any(), loadBuffersAndCleanup],
  };
}

export const upload = wrapWithCleanup(createUpload(DEFAULT_ALLOWED_MIMETYPES));
export const audioUpload = wrapWithCleanup(createUpload(AUDIO_ALLOWED_MIMETYPES));

/**
 * Express error handler for Multer errors.
 * Maps MulterError codes to user-friendly HTTP responses.
 */
export function multerErrorHandler(
  err: Error,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (err instanceof MulterError) {
    const messages: Record<string, string> = {
      LIMIT_FILE_SIZE: `Il file supera il limite di ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB`,
      LIMIT_FILE_COUNT: 'Troppi file caricati',
      LIMIT_UNEXPECTED_FILE: 'Campo file non previsto o tipo file non supportato',
    };
    const message = messages[err.code] ?? `Errore upload: ${err.message}`;
    res.status(400).json({ status: 'error', code: err.code, message });
    return;
  }
  next(err);
}
