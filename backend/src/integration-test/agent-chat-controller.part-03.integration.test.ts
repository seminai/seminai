import { Request, Response } from 'express';
import { WorkspaceKind } from '@prisma/client';
import { prisma, createTestUser, createTestWorkspace, deleteTestWorkspace, type ITestUser } from './helpers';
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
void (() => mockedApproveAction);
const mockedRejectAction = jest.mocked(rejectAction);
void (() => mockedRejectAction);
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

  describe('workspace kind routing (WORKSPACE_KIND_ROUTING)', () => {
    const ORIGINAL_FLAG = process.env.WORKSPACE_KIND_ROUTING;
    let agriWorkspaceId: string;
    let mfgWorkspaceId: string;

    beforeAll(async () => {
      const agri = await createTestWorkspace({
        userId: owner.id,
        name: `Routing Agri ${Date.now()}`,
        kind: WorkspaceKind.AGRICULTURAL,
      });
      const mfg = await createTestWorkspace({
        userId: owner.id,
        name: `Routing Mfg ${Date.now()}`,
        kind: WorkspaceKind.MANUFACTURING,
      });
      agriWorkspaceId = agri.id;
      mfgWorkspaceId = mfg.id;
    });

    afterAll(async () => {
      await deleteTestWorkspace(agriWorkspaceId);
      await deleteTestWorkspace(mfgWorkspaceId);
      if (ORIGINAL_FLAG === undefined) {
        delete process.env.WORKSPACE_KIND_ROUTING;
      } else {
        process.env.WORKSPACE_KIND_ROUTING = ORIGINAL_FLAG;
      }
    });

    beforeEach(() => {
      mockedCreateReactAgent.mockResolvedValue({
        stream: jest.fn(),
        getState: jest.fn(),
        updateState: jest.fn(),
      } as never);
      mockedHandleUserMessage.mockResolvedValue({ status: 'COMPLETED', message: 'ok' } as never);
    });

    afterEach(() => {
      delete process.env.WORKSPACE_KIND_ROUTING;
    });

    it('flag off: message without workspaceId succeeds via the dosage agent', async () => {
      delete process.env.WORKSPACE_KIND_ROUTING;
      const request = {
        user: { id: owner.id },
        body: { threadId: `thread-${Date.now()}-flag-off`, message: 'ciao' },
      } as Request;
      const response = createMockResponse();

      await controller.message(request, response);

      expect(response.status).toHaveBeenCalledWith(200);
      expect(mockedCreateReactAgent).toHaveBeenCalled();
    });

    it('flag on + missing workspaceId: rejects 400 WORKSPACE_ID_REQUIRED', async () => {
      process.env.WORKSPACE_KIND_ROUTING = 'true';
      const request = {
        user: { id: owner.id },
        body: { threadId: `thread-${Date.now()}-required`, message: 'ciao' },
      } as Request;

      await expect(controller.message(request, createMockResponse())).rejects.toMatchObject({
        statusCode: 400,
        code: 'WORKSPACE_ID_REQUIRED',
      });
      expect(mockedCreateReactAgent).not.toHaveBeenCalled();
    });

    it('flag on + AGRICULTURAL workspace: routes to the dosage agent (real membership query)', async () => {
      process.env.WORKSPACE_KIND_ROUTING = 'true';
      const request = {
        user: { id: owner.id },
        body: {
          threadId: `thread-${Date.now()}-agri`,
          message: 'ciao',
          workspaceId: agriWorkspaceId,
        },
      } as Request;
      const response = createMockResponse();

      await controller.message(request, response);

      expect(response.status).toHaveBeenCalledWith(200);
      expect(mockedCreateReactAgent).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: agriWorkspaceId }),
      );
    });

    it('flag on + MANUFACTURING workspace: routes to the manufacture agent (Phase 4)', async () => {
      process.env.WORKSPACE_KIND_ROUTING = 'true';
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      const request = {
        user: { id: owner.id },
        body: {
          threadId: `thread-${Date.now()}-mfg`,
          message: 'ciao',
          workspaceId: mfgWorkspaceId,
        },
      } as Request;
      const response = createMockResponse();

      await controller.message(request, response);

      expect(response.status).toHaveBeenCalledWith(200);
      // The manufacture adapter forces the manufacturing bundle + domain.
      expect(mockedCreateReactAgent).toHaveBeenCalledWith(
        expect.objectContaining({ toolBundle: 'MANUFACTURING', domain: 'MANUFACTURING' }),
      );
      // No fallback warning: MANUFACTURING is now a registered agent.
      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('falling back to dosage agent'),
      );
      warnSpy.mockRestore();
    });

    it('flag on + jobId without workspaceId: forces the dosage agent, no 400', async () => {
      process.env.WORKSPACE_KIND_ROUTING = 'true';
      const request = {
        user: { id: owner.id },
        body: {
          threadId: `thread-${Date.now()}-job`,
          message: 'ciao',
          jobId: 'job-routing-123',
        },
      } as Request;
      const response = createMockResponse();

      await controller.message(request, response);

      expect(response.status).toHaveBeenCalledWith(200);
      expect(mockedCreateReactAgent).toHaveBeenCalled();
    });

    it('flag on + workspace the user is not a member of: rejects 403 WORKSPACE_ACCESS_DENIED', async () => {
      process.env.WORKSPACE_KIND_ROUTING = 'true';
      const request = {
        user: { id: otherUser.id },
        body: {
          threadId: `thread-${Date.now()}-403`,
          message: 'ciao',
          workspaceId: agriWorkspaceId,
        },
      } as Request;

      await expect(controller.message(request, createMockResponse())).rejects.toMatchObject({
        statusCode: 403,
        code: 'WORKSPACE_ACCESS_DENIED',
      });
      expect(mockedCreateReactAgent).not.toHaveBeenCalled();
    });
  });});
