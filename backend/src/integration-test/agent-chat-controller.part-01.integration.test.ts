import { LIVE_TEST_CHAT_MODEL } from './live-llm-test-config';
import { Request, Response } from 'express';
import { ChatCategory } from '@prisma/client';
import { prisma, createTestUser, type ITestUser } from './helpers';
import { TEST_INVITE_CODE } from './constants';
import { RegisterUseCase } from '../application/use-cases/auth/RegisterUseCase';
import { PrismaUserRepository } from '../infrastructure/repositories/PrismaUserRepository';
import { AgentChatController } from '../infrastructure/http/controllers/AgentChatController';

jest.mock('../infrastructure/services/agents/dosage_agent_react/DosageReactAgent', () => ({
  createReactAgent: jest.fn(),
  handleUserMessage: jest.fn(),
  approveAction: jest.fn(),
  rejectAction: jest.fn(),
  getAgentState: jest.fn(),
  getCachedAgentApp: jest.fn(),
}));

import { createReactAgent, handleUserMessage, approveAction, rejectAction, getAgentState } from '../infrastructure/services/agents/dosage_agent_react/DosageReactAgent';

const mockedCreateReactAgent = jest.mocked(createReactAgent);
const mockedHandleUserMessage = jest.mocked(handleUserMessage);
const mockedApproveAction = jest.mocked(approveAction);
const mockedRejectAction = jest.mocked(rejectAction);
const mockedGetAgentState = jest.mocked(getAgentState);
void (() => mockedGetAgentState);

function createMockResponse(): Response & {
  statusCode?: number;
  body?: unknown;
} {
  const response = {} as Response & { statusCode?: number; body?: unknown };
  response.status = jest.fn().mockImplementation((code: number) => {
    response.statusCode = code;
    return response;
  });
  response.json = jest.fn().mockImplementation((body: unknown) => {
    response.body = body;
    return response;
  });
  return response;
}
describe('AgentChatController integration', () => {
  const controller = new AgentChatController();
  let owner: ITestUser;
  let otherUser: ITestUser;

  beforeAll(async () => {
    owner = await createTestUser();
    const register = new RegisterUseCase(new PrismaUserRepository(prisma));
    const created = await register.execute({
      email: `agent-chat-controller-${Date.now()}@example.com`,
      password: 'Password123!',
      name: 'Agent Chat Controller User',
      inviteCode: TEST_INVITE_CODE,
    });
    otherUser = {
      id: created.id,
      email: created.email,
      password: 'Password123!',
      name: created.name,
      emailVerified: created.emailVerified,
    };
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await prisma.agentStreamEvent.deleteMany({});
    await prisma.message.deleteMany({});
    await prisma.chat.deleteMany({});
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: otherUser.id } });
  });

  it('rejects access to a thread owned by another user', async () => {
    const threadId = `thread-${Date.now()}`;
    await prisma.chat.create({
      data: {
        userId: owner.id,
        category: ChatCategory.DOSAGE_AGENT,
        threadId,
      },
    });

    const request = {
      user: { id: otherUser.id },
      body: { threadId, message: 'ciao' },
    } as Request;
    const response = createMockResponse();

    await expect(controller.message(request, response)).rejects.toMatchObject({
      statusCode: 403,
      code: 'CHAT_FORBIDDEN',
    });
    expect(mockedCreateReactAgent).not.toHaveBeenCalled();
  });

  it('passes requireApproval=false for approve and reject recovery flows', async () => {
    const threadId = `thread-${Date.now()}-approve`;
    const chat = await prisma.chat.create({
      data: {
        userId: owner.id,
        category: ChatCategory.DOSAGE_AGENT,
        threadId,
      },
    });

    mockedCreateReactAgent.mockResolvedValue({
      stream: jest.fn(),
      getState: jest.fn(),
      updateState: jest.fn(),
    } as never);
    mockedApproveAction.mockResolvedValue({ status: 'COMPLETED', message: 'ok' });
    mockedRejectAction.mockResolvedValue({ status: 'COMPLETED', message: 'ko' });

    const approveRequest = {
      user: { id: owner.id },
      body: { threadId, modelName: LIVE_TEST_CHAT_MODEL },
    } as Request;
    const rejectRequest = {
      user: { id: owner.id },
      body: { threadId, modelName: LIVE_TEST_CHAT_MODEL },
    } as Request;

    await controller.approve(approveRequest, createMockResponse());
    await controller.reject(rejectRequest, createMockResponse());

    expect(mockedCreateReactAgent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ threadId, requireApproval: true }),
    );
    expect(mockedCreateReactAgent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ threadId, requireApproval: true }),
    );

    await prisma.message.deleteMany({ where: { chatId: chat.id } });
    await prisma.chat.delete({ where: { id: chat.id } });
  });

  it('does not treat pending approval as an active stream and closes it after approve', async () => {
    const threadId = `thread-${Date.now()}-approval-state`;
    await prisma.chat.create({
      data: {
        userId: owner.id,
        category: ChatCategory.DOSAGE_AGENT,
        threadId,
      },
    });
    await prisma.agentStreamEvent.create({
      data: {
        threadId,
        seq: 1,
        type: 'requires_approval',
        payload: {
          type: 'requires_approval',
          toolCall: { name: 'execute_treatment_plan', args: { dryRun: false } },
          riskLevel: 'medium',
        },
      },
    });

    mockedCreateReactAgent.mockResolvedValue({
      stream: jest.fn(),
      getState: jest.fn(),
      updateState: jest.fn(),
    } as never);
    mockedApproveAction.mockResolvedValue({ status: 'COMPLETED', message: 'ok' });

    const stateBeforeResponse = createMockResponse();
    await controller.getStreamState(
      { user: { id: owner.id }, params: { threadId } } as unknown as Request,
      stateBeforeResponse,
    );

    expect(stateBeforeResponse.body).toMatchObject({
      status: 'success',
      data: {
        isStreaming: false,
        lastStatus: 'requires_approval',
      },
    });

    await controller.approve(
      { user: { id: owner.id }, body: { threadId } } as Request,
      createMockResponse(),
    );

    const latest = await prisma.agentStreamEvent.findFirst({
      where: { threadId },
      orderBy: { seq: 'desc' },
    });
    expect(latest).toMatchObject({ seq: 2, type: 'complete' });

    const stateAfterResponse = createMockResponse();
    await controller.getStreamState(
      { user: { id: owner.id }, params: { threadId } } as unknown as Request,
      stateAfterResponse,
    );
    expect(stateAfterResponse.body).toMatchObject({
      status: 'success',
      data: {
        isStreaming: false,
        lastStatus: 'completed',
        lastSeq: 2,
      },
    });
  });

  it('adds unresolved mention diagnostics to non-streaming message prompt', async () => {
    const threadId = `thread-${Date.now()}-mentions`;
    mockedCreateReactAgent.mockResolvedValue({
      stream: jest.fn(),
      getState: jest.fn(),
      updateState: jest.fn(),
    } as never);
    mockedHandleUserMessage.mockResolvedValue({
      status: 'COMPLETED',
      message: 'ok',
    } as never);

    const request = {
      user: { id: owner.id },
      body: {
        threadId,
        message: 'Controlla questo documento',
        mentions: [{ type: 'file', id: 'missing-file-id', label: 'missing-file.pdf' }],
      },
    } as Request;
    const response = createMockResponse();

    await controller.message(request, response);

    expect(mockedHandleUserMessage).toHaveBeenCalledWith(
      expect.anything(),
      threadId,
      expect.stringContaining('[SYSTEM: Mention non risolte]'),
    );
    expect(response.status).toHaveBeenCalledWith(200);
  });});
