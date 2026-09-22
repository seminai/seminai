import { AppError } from '../../../domain/errors/AppError';
import { WorkspaceKind } from '@prisma/client';
import { resolveChatAgent } from '../../services/agents/chat-routing/resolveChatAgent';
import type { ChatAgentPort } from '../../services/agents/chat-routing/ChatAgentPort';
import type { AgentChatControllerContext } from './agent-chat-controller.context';

export async function agentChatControllerResolveAgentForRequest(this: AgentChatControllerContext, {
    userId,
    workspaceId,
    jobId,
  }: {
    readonly userId: string;
    readonly workspaceId?: string;
    readonly jobId?: string;
  }): Promise<ChatAgentPort> {
    if (jobId) {
      return resolveChatAgent({ workspaceKind: WorkspaceKind.AGRICULTURAL });
    }

    if (process.env.WORKSPACE_KIND_ROUTING !== 'true') {
      if (workspaceId) {
        await this.validateWorkspaceMembership(userId, workspaceId);
      }
      return resolveChatAgent({ workspaceKind: null });
    }

    if (!workspaceId) {
      throw AppError.badRequest('workspaceId is required', 'WORKSPACE_ID_REQUIRED');
    }
    const workspaceKind = await this.loadWorkspaceKindForMember(userId, workspaceId);
    return resolveChatAgent({ workspaceKind });
  }
