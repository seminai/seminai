import { Readable } from 'stream';
import { FileService } from '../FileService';

interface MulterFile {
  readonly fieldname: string;
  readonly originalname: string;
  readonly encoding: string;
  readonly mimetype: string;
  readonly size: number;
  readonly buffer: Buffer;
  readonly destination?: string;
  readonly filename?: string;
  readonly path?: string;
  readonly stream?: Readable;
}

function sanitizeFilename(input: string): string {
  return input
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[^a-zA-Z0-9-_\.]/g, '_');
}

/** Store a SIAN PDF through the configured file-storage adapter. */
export async function uploadSianPdf(input: {
  readonly buffer: Buffer;
  readonly userId: string;
  readonly name: string;
  readonly registrationNumber: string;
}): Promise<string> {
  const { buffer, userId, name, registrationNumber } = input;
  const originalName = `${sanitizeFilename(name)}_${registrationNumber}.pdf`;
  const file: MulterFile = {
    fieldname: 'file',
    originalname: originalName,
    encoding: '7bit',
    mimetype: 'application/pdf',
    size: buffer.length,
    destination: '',
    filename: originalName,
    path: '',
    buffer,
    stream: Readable.from(buffer),
  };
  return await new FileService(userId).uploadFile(file, userId, 'labelSian', 'sian-label');
}
