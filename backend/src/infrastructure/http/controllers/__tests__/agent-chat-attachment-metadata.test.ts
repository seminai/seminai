import type { MulterFile } from '../../../services/Multer';
import { buildChatAttachmentMetadata } from '../agent-chat-attachment-metadata';

function createFile(overrides: Partial<MulterFile>): MulterFile {
  return {
    fieldname: 'files',
    originalname: 'document.pdf',
    encoding: '7bit',
    mimetype: 'application/pdf',
    size: 128,
    buffer: Buffer.from('file'),
    ...overrides,
  };
}

describe('buildChatAttachmentMetadata', () => {
  it('classifies images and preserves file fields', async () => {
    const inputFile = createFile({
      originalname: 'leaf.png',
      mimetype: 'image/png',
      size: 2048,
    });

    const actualResult = await buildChatAttachmentMetadata({
      files: [inputFile],
      userId: 'user-1',
      uploadFile: async () => 'https://storage.example/leaf.png',
    });

    expect(actualResult[0]).toMatchObject({
      name: 'leaf.png',
      mimeType: 'image/png',
      size: 2048,
      url: 'https://storage.example/leaf.png',
      kind: 'image',
    });
    expect(actualResult[0]?.id).toEqual(expect.any(String));
  });

  it('classifies PDFs and office files as documents', async () => {
    const inputFiles = [
      createFile({ originalname: 'invoice.pdf', mimetype: 'application/pdf' }),
      createFile({
        originalname: 'stock.xlsx',
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    ];

    const actualResult = await buildChatAttachmentMetadata({
      files: inputFiles,
      userId: 'user-1',
      uploadFile: async (file) => `https://storage.example/${file.originalname}`,
    });

    expect(actualResult.map((item) => item.kind)).toEqual(['document', 'document']);
    expect(actualResult.map((item) => item.url)).toEqual([
      'https://storage.example/invoice.pdf',
      'https://storage.example/stock.xlsx',
    ]);
  });

  it('classifies unsupported document-like uploads as other', async () => {
    const inputFile = createFile({
      originalname: 'shape.zip',
      mimetype: 'application/zip',
    });

    const actualResult = await buildChatAttachmentMetadata({
      files: [inputFile],
      userId: 'user-1',
      uploadFile: async () => 'https://storage.example/shape.zip',
    });

    expect(actualResult[0]?.kind).toBe('other');
  });
});
