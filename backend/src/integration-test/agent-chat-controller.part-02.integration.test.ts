import { Request, Response } from 'express';
import { ChatCategory } from '@prisma/client';
import { prisma, createTestUser, type ITestUser } from './helpers';
import { TEST_INVITE_CODE } from './constants';
import { RegisterUseCase } from '../application/use-cases/auth/RegisterUseCase';
import { PrismaUserRepository } from '../infrastructure/repositories/PrismaUserRepository';
import { AgentChatController } from '../infrastructure/http/controllers/AgentChatController';
import { updateWorkingMemory, clearWorkingMemory } from '../infrastructure/services/agents/dosage_agent_react/working-memory';

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
void (() => mockedHandleUserMessage);
const mockedApproveAction = jest.mocked(approveAction);
void (() => mockedApproveAction);
const mockedRejectAction = jest.mocked(rejectAction);
void (() => mockedRejectAction);
const mockedGetAgentState = jest.mocked(getAgentState);

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

  it('returns pendingQuestionnaire in state responses', async () => {
    const threadId = `thread-${Date.now()}-state`;
    await prisma.chat.create({
      data: {
        userId: owner.id,
        category: ChatCategory.DOSAGE_AGENT,
        threadId,
      },
    });

    updateWorkingMemory(threadId, {
      pendingQuestionnaire: {
        title: 'Questionario test',
        questions: [{ id: 'q1', question: 'Domanda', type: 'text', required: true }],
      },
    });
    mockedCreateReactAgent.mockResolvedValue({
      stream: jest.fn(),
      getState: jest.fn(),
      updateState: jest.fn(),
    } as never);
    mockedGetAgentState.mockResolvedValue({
      messages: [],
      loopCounter: 0,
      lastToolCalls: [],
      taskList: [],
    });

    const request = {
      user: { id: owner.id },
      params: { threadId },
      query: {},
    } as unknown as Request;
    const response = createMockResponse();

    await controller.getState(request, response);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.body).toMatchObject({
      status: 'success',
      data: { pendingQuestionnaire: { title: 'Questionario test' } },
    });
    clearWorkingMemory(threadId);
  });});
