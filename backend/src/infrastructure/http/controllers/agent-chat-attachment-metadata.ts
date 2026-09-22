import { randomUUID } from 'crypto';
import type { MulterFile } from '../../services/Multer';

type ChatAttachmentKind = 'image' | 'document' | 'other';

type ChatAttachmentMetadata = Readonly<{
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url: string;
  kind: ChatAttachmentKind;
}>;

type UploadFile = (file: MulterFile, userId: string, path: string, type: string) => Promise<string>;

type BuildInput = Readonly<{
  files: readonly MulterFile[];
  userId: string;
  uploadFile: UploadFile;
}>;

const DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'text/csv',
  'text/plain',
  'text/xml',
  'application/xml',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const DOCUMENT_EXTENSIONS = /\.(csv|doc|docx|pdf|txt|xls|xlsx|xml)$/i;

function getKind(file: MulterFile): ChatAttachmentKind {
  const mimeType = file.mimetype.toLowerCase();
  if (mimeType.startsWith('image/')) return 'image';
  if (DOCUMENT_MIME_TYPES.has(mimeType) || DOCUMENT_EXTENSIONS.test(file.originalname)) {
    return 'document';
  }
  return 'other';
}

/**
 * Uploads chat files and returns serializable metadata for user message history.
 */
export async function buildChatAttachmentMetadata({
  files,
  userId,
  uploadFile,
}: BuildInput): Promise<ReadonlyArray<ChatAttachmentMetadata>> {
  return Promise.all(
    files.map(async (file) => {
      const kind = getKind(file);
      const url = await uploadFile(file, userId, 'chat-attachments', kind);
      return {
        id: randomUUID(),
        name: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        url,
        kind,
      };
    }),
  );
}
