import type { AgentChatControllerContext } from './agent-chat-controller.context';

export function agentChatControllerBuildUserMessageMetadata(this: AgentChatControllerContext, {
    jobId,
    attachments,
  }: {
    readonly jobId?: string;
    readonly attachments: readonly unknown[];
  }): Record<string, unknown> | undefined {
    if (!jobId && attachments.length === 0) return undefined;
    return {
      ...(jobId ? { jobId } : {}),
      ...(attachments.length > 0 ? { attachments } : {}),
    };
  }
