import { ProcessInboundEmailUseCase } from '../application/use-cases/email-inbound/ProcessInboundEmailUseCase';
import { EmailIngestion } from '../domain/entities/EmailIngestion';
import { type ParsedInboundEmailDto } from '../domain/dtos/email-inbound.dto';

function buildParsedEmail(overrides: Partial<ParsedInboundEmailDto> = {}): ParsedInboundEmailDto {
  return {
    messageId: 'msg-1',
    fromAddress: 'mario@example.com',
    toAddresses: ['inbox@inbox.seminai.app'],
    subject: 'Test',
    bodyText: 'hello',
    rawHeaders: {},
    attachments: [],
    ...overrides,
  };
}

describe('ProcessInboundEmailUseCase — idempotency', () => {
  it('returns "duplicate" without re-processing when Message-ID already exists', async () => {
    const existing = new EmailIngestion(
      'ing-1',
      'msg-1',
      'DISPATCHED',
      'mario@example.com',
      'inbox@inbox.seminai.app',
      new Date(),
    );
    const repository = {
      findByMessageId: jest.fn().mockResolvedValue(existing),
      create: jest.fn(),
      findById: jest.fn(),
      findByDisambiguationToken: jest.fn(),
      findAttachmentsByIngestionId: jest.fn(),
      update: jest.fn(),
      attachFiles: jest.fn(),
    };
    const userRepo = { findById: jest.fn(), findByEmail: jest.fn() };
    const companyRepo = { findById: jest.fn(), findManyByUserId: jest.fn() };
    const attachmentStorage = { storeAll: jest.fn() };
    const resolveSenderUseCase = { execute: jest.fn() };
    const dispatchToAgentUseCase = { execute: jest.fn() };
    const handleDisambiguationReplyUseCase = { execute: jest.fn() };
    const sendDisambiguationRequestEmailUseCase = { execute: jest.fn() };
    const sendIngestionConfirmationEmailUseCase = { execute: jest.fn() };
    const sendUnknownSenderEmailUseCase = { execute: jest.fn() };
    const sendOptOutEmailUseCase = { execute: jest.fn() };
    const useCase = new ProcessInboundEmailUseCase({
      emailIngestionRepository: repository,
      userRepository: userRepo,
      companyRepository: companyRepo,
      attachmentStorage,
      resolveSenderUseCase,
      dispatchToAgentUseCase,
      handleDisambiguationReplyUseCase,
      sendDisambiguationRequestEmailUseCase,
      sendIngestionConfirmationEmailUseCase,
      sendUnknownSenderEmailUseCase,
      sendOptOutEmailUseCase,
      limits: {
        maxAttachments: 20,
        maxTotalBytes: 1_000_000,
        maxPerFileBytes: 500_000,
        maxCompaniesInDisambiguation: 10,
      },
    } as never);
    const result = await useCase.execute(buildParsedEmail());
    expect(result.outcome).toBe('duplicate');
    expect(result.ingestionId).toBe('ing-1');
    expect(repository.create).not.toHaveBeenCalled();
    expect(resolveSenderUseCase.execute).not.toHaveBeenCalled();
  });
});
