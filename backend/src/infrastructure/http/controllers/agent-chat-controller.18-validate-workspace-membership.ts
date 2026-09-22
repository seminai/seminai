import { AppError } from '../../../domain/errors/AppError';
import { prisma } from '../../repositories/Prisma';
import type { AgentChatControllerContext } from './agent-chat-controller.context';

export async function agentChatControllerValidateWorkspaceMembership(this: AgentChatControllerContext, userId: string, workspaceId: string): Promise<void> {
    const membership = await prisma.workspaceMember.findFirst({
      where: { userId, workspaceId },
      select: { id: true },
    });
    if (!membership) {
      throw AppError.forbidden(
        'User is not a member of the specified workspace',
        'WORKSPACE_ACCESS_DENIED',
      );
    }
  }
