import { AppError } from '../../../domain/errors/AppError';
import { prisma } from '../../repositories/Prisma';
import { WorkspaceKind } from '@prisma/client';
import type { AgentChatControllerContext } from './agent-chat-controller.context';

export async function agentChatControllerLoadWorkspaceKindForMember(this: AgentChatControllerContext, userId: string, workspaceId: string): Promise<WorkspaceKind> {
    const membership = await prisma.workspaceMember.findFirst({
      where: { userId, workspaceId },
      select: { workspace: { select: { kind: true } } },
    });
    if (!membership) {
      throw AppError.forbidden(
        'User is not a member of the specified workspace',
        'WORKSPACE_ACCESS_DENIED',
      );
    }
    return membership.workspace.kind;
  }
