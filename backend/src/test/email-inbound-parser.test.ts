import { type Request } from 'express';
import { SendgridInboundParser } from '../infrastructure/services/email-ingestion/SendgridInboundParser';
import { type MulterFile } from '../infrastructure/services/Multer';

function buildRequest(overrides: {
  body?: Record<string, unknown>;
  files?: ReadonlyArray<Partial<MulterFile>>;
}): Request {
  return {
    body: overrides.body ?? {},
    files: overrides.files ?? [],
  } as unknown as Request;
}

function buildAttachment(input: Partial<MulterFile>): MulterFile {
  return {
    fieldname: 'attachment1',
    originalname: 'doc.pdf',
    encoding: '7bit',
    mimetype: 'application/pdf',
    size: 1024,
    buffer: Buffer.from('test'),
    ...input,
  } as MulterFile;
}

describe('SendgridInboundParser', () => {
  const parser = new SendgridInboundParser();

  it('extracts Message-ID from raw headers', () => {
    const req = buildRequest({
      body: {
        from: 'user@example.com',
        to: 'inbox@inbox.seminai.app',
        subject: 'Test',
        text: 'hi',
        headers: 'From: user@example.com\nMessage-ID: <abc123@example.com>\nSubject: Test',
      },
    });
    const result = parser.parse(req);
    expect(result.messageId).toBe('abc123@example.com');
  });

  it('parses name + address from From header', () => {
    const req = buildRequest({
      body: { from: '"Mario Rossi" <mario@example.com>', headers: '', to: 'a@b.com' },
    });
    const result = parser.parse(req);
    expect(result.fromAddress).toBe('mario@example.com');
    expect(result.fromName).toBe('Mario Rossi');
  });

  it('returns lowercase from-address even without name', () => {
    const req = buildRequest({ body: { from: 'USER@Example.com', to: 'a@b.com', headers: '' } });
    const result = parser.parse(req);
    expect(result.fromAddress).toBe('user@example.com');
  });

  it('falls back to synthetic Message-ID when header is missing', () => {
    const req = buildRequest({ body: { from: 'a@b.com', to: 'c@d.com', headers: '' } });
    const result = parser.parse(req);
    expect(result.messageId).toMatch(/^synthetic-/);
  });

  it('parses uploaded files into attachments array', () => {
    const req = buildRequest({
      body: { from: 'a@b.com', to: 'c@d.com', headers: '' },
      files: [
        buildAttachment({ originalname: 'piano.pdf' }),
        buildAttachment({ originalname: 'foto.jpg', mimetype: 'image/jpeg', size: 2048 }),
      ],
    });
    const result = parser.parse(req);
    expect(result.attachments).toHaveLength(2);
    expect(result.attachments[0].fileName).toBe('piano.pdf');
    expect(result.attachments[1].mimeType).toBe('image/jpeg');
    expect(result.attachments[1].sizeBytes).toBe(2048);
  });

  it('handles missing body fields gracefully', () => {
    const req = buildRequest({ body: {} });
    const result = parser.parse(req);
    expect(result.fromAddress).toBe('');
    expect(result.subject).toBe('');
    expect(result.bodyText).toBe('');
    expect(result.attachments).toHaveLength(0);
  });

  it('extracts In-Reply-To header', () => {
    const req = buildRequest({
      body: {
        headers: 'Message-ID: <new@example.com>\nIn-Reply-To: <previous@example.com>',
        from: 'a@b.com',
        to: 'c@d.com',
      },
    });
    const result = parser.parse(req);
    expect(result.inReplyTo).toBe('previous@example.com');
  });
});
