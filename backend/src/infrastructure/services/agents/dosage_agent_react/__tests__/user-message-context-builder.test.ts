const mockGetWorkingMemory = jest.fn();
const mockResolveMentionContext = jest.fn();

jest.mock('../working-memory', () => ({
  getWorkingMemory: (...args: unknown[]) => mockGetWorkingMemory(...args),
}));

jest.mock('../mention-context-resolver', () => ({
  resolveMentionContext: (...args: unknown[]) => mockResolveMentionContext(...args),
}));

import { buildUserMessageContext } from '../user-message-context-builder';

describe('user-message-context-builder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetWorkingMemory.mockReturnValue({});
    mockResolveMentionContext.mockResolvedValue({ context: '', unresolved: [] });
  });

  it('adds document upload metadata with extract_from_file guidance', async () => {
    mockGetWorkingMemory.mockReturnValue({
      uploadedFileBuffer: Buffer.from('demo'),
      uploadedFileName: 'invoice.pdf',
      uploadedFileMimeType: 'application/pdf',
      uploadedFiles: [
        { fileName: 'invoice.pdf', mimeType: 'application/pdf', buffer: Buffer.from('demo') },
      ],
    });

    const result = await buildUserMessageContext({
      threadId: 'thread-1',
      userMessage: 'Analizza il documento',
      includeWorkingMemoryContext: true,
    });

    expect(result.enrichedMessage).toContain('file allegato/i in working memory');
    expect(result.enrichedMessage).toContain('usa extract_from_file per elaborarli');
    expect(result.enrichedMessage).toContain('invoice.pdf');
  });

  it('routes supported image attachments to diagnose_from_photo', async () => {
    mockGetWorkingMemory.mockReturnValue({
      uploadedFileBuffer: Buffer.from('demo'),
      uploadedFileName: 'leaf.png',
      uploadedFileMimeType: 'image/png',
      uploadedFiles: [{ fileName: 'leaf.png', mimeType: 'image/png', buffer: Buffer.from('demo') }],
    });

    const result = await buildUserMessageContext({
      threadId: 'thread-image',
      userMessage: 'Che problema ha questa pianta?',
      includeWorkingMemoryContext: true,
    });

    expect(result.enrichedMessage).toContain('diagnose_from_photo');
    expect(result.enrichedMessage).toContain('NON usare extract_from_file per analizzare immagini');
    expect(result.enrichedMessage).toContain('leaf.png');
  });

  it('preserves text when enriching a text plus image message', async () => {
    mockGetWorkingMemory.mockReturnValue({
      uploadedFiles: [
        { fileName: 'leaf.webp', mimeType: 'image/webp', buffer: Buffer.from('demo') },
      ],
    });

    const result = await buildUserMessageContext({
      threadId: 'thread-text-image',
      userMessage: 'La vite ha macchie gialle da ieri',
      includeWorkingMemoryContext: true,
    });

    expect(result.enrichedMessage).toContain('La vite ha macchie gialle da ieri');
    expect(result.enrichedMessage).toContain('diagnose_from_photo');
    expect(result.enrichedMessage).toContain('leaf.webp');
  });

  it('includes unresolved mention diagnostics in the prompt', async () => {
    mockResolveMentionContext.mockResolvedValue({
      context: "[SYSTEM: Contesto entita' menzionate dall'utente (@mention)]\n**Documento: DDT**",
      unresolved: [{ type: 'file', id: 'missing-id', label: 'DDT', reason: 'not_found' }],
    });

    const result = await buildUserMessageContext({
      threadId: 'thread-1',
      userId: 'user-1',
      userMessage: 'Che dati contiene?',
      mentions: [{ type: 'file', id: 'missing-id', label: 'DDT' }],
      includeWorkingMemoryContext: true,
    });

    expect(result.enrichedMessage).toContain("Contesto entita' menzionate");
    expect(result.enrichedMessage).toContain('[SYSTEM: Mention non risolte]');
    expect(result.enrichedMessage).toContain('file:missing-id -> not_found');
    expect(result.enrichedMessage).toContain("NON dire 'allega il file'");
  });
});
