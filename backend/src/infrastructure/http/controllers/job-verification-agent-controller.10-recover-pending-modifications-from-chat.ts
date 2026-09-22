import { prisma } from '../../repositories/Prisma';
import { PendingModificationRecord } from './job-verification-agent-controller.support';
import type { JobVerificationAgentControllerContext } from './job-verification-agent-controller.context';

export async function jobVerificationAgentControllerRecoverPendingModificationsFromChat(this: JobVerificationAgentControllerContext, chatId: string, db: typeof prisma): Promise<PendingModificationRecord[]> {
    const lastPendingMessage = await db.message.findFirst({
      where: {
        chatId,
        role: 'ASSISTANT',
        status: 'REQUIRES_APPROVAL',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!lastPendingMessage?.pendingToolCalls) return [];

    const toolCalls = lastPendingMessage.pendingToolCalls as unknown as Array<
      Record<string, unknown>
    >;

    for (const tc of toolCalls) {
      if (tc.actionType === 'job_modification' && Array.isArray(tc.modifications)) {
        return tc.modifications as PendingModificationRecord[];
      }
    }

    return [];
  }
