import { Request, Response } from 'express';
import { MessageRole } from '@prisma/client';
import { prisma, createTestUser, type ITestUser } from './helpers';
import { AgentChatController } from '../infrastructure/http/controllers/AgentChatController';
import type { MulterFile } from '../infrastructure/services/Multer';

const mockStreamReactAgent = jest.fn();
const mockUploadFile = jest.fn();

jest.mock('../infrastructure/services/agents/dosage_agent_react/DosageReactAgent', () => ({
  createReactAgent: jest.fn(),
  handleUserMessage: jest.fn(),
  approveAction: jest.fn(),
  rejectAction: jest.fn(),
  getAgentState: jest.fn(),
  getCachedAgentApp: jest.fn(),
}));

jest.mock('../infrastructure/services/agents/dosage_agent_react/streaming', () => ({
  streamReactAgent: (...args: unknown[]) => mockStreamReactAgent(...args),
}));

jest.mock('../infrastructure/services/FileService', () => ({
  FileService: jest.fn().mockImplementation(() => ({
    uploadFile: (...args: unknown[]) => mockUploadFile(...args),
  })),
}));

function createMockResponse(): Response & { readonly writableEnded: boolean } {
  const response = { writableEnded: false } as Response & { writableEnded: boolean };
  response.setHeader = jest.fn().mockReturnValue(response);
  response.flushHeaders = jest.fn();
  response.on = jest.fn().mockReturnValue(response);
  response.write = jest.fn().mockReturnValue(true);
  response.end = jest.fn().mockImplementation(() => {
    response.writableEnded = true;
    return response;
  });
  return response;
}

async function* createCompletedStream(): AsyncGenerator<
  unknown,
  { readonly status: 'COMPLETED'; readonly message: string },
  unknown
> {
  yield { type: 'complete', response: { status: 'COMPLETED', message: 'ok' } };
  return { status: 'COMPLETED', message: 'ok' };
}

function createMulterFile(overrides: Partial<MulterFile>): MulterFile {
  return {
    fieldname: 'files',
    originalname: 'leaf.png',
    encoding: '7bit',
    mimetype: 'image/png',
    size: 1024,
    buffer: Buffer.from('image'),
    ...overrides,
  };
}

describe('AgentChatController attachment stream integration', () => {
  const controller = new AgentChatController();
  let owner: ITestUser;

  beforeAll(async () => {
    owner = await createTestUser();
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await prisma.agentStreamEvent.deleteMany({});
    await prisma.message.deleteMany({});
    await prisma.chat.deleteMany({});
  });

  it('persists uploaded stream attachment metadata on the user message', async () => {
    const threadId = `thread-${Date.now()}-stream-attachment`;
    const inputFile = createMulterFile({
      originalname: 'leaf.png',
      mimetype: 'image/png',
      size: 2048,
    });
    mockUploadFile.mockResolvedValue('https://storage.example/chat/leaf.png');
    mockStreamReactAgent.mockReturnValue(createCompletedStream());

    const request = {
      user: { id: owner.id },
      body: { threadId, message: 'Analizza questa foto' },
      files: [inputFile],
    } as unknown as Request;

    await controller.stream(request, createMockResponse());

    const actualMessage = await prisma.message.findFirst({
      where: { role: MessageRole.USER },
    });
    expect(actualMessage?.metadata).toMatchObject({
      attachments: [
        {
          name: 'leaf.png',
          mimeType: 'image/png',
          size: 2048,
          url: 'https://storage.example/chat/leaf.png',
          kind: 'image',
        },
      ],
    });
    expect(mockUploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ originalname: 'leaf.png' }),
      owner.id,
      'chat-attachments',
      'image',
    );
  });
});
