import { prisma } from '../../repositories/Prisma';
import type { AgentResponse } from '../../services/agents/dosage_agent_react/DosageReactAgent';
import { PrismaAgentStreamEventRepository } from '../../repositories/PrismaAgentStreamEventRepository';
import { createChatEmitter } from '../../services/agents/dosage_agent_react/socket/chat-socket-emitter';
import type { AgentChatControllerContext } from './agent-chat-controller.context';

export async function agentChatControllerPersistAgentResponseStreamEvent(this: AgentChatControllerContext, threadId: string, response: AgentResponse): Promise<void> {
    const event = this.buildStreamEventFromAgentResponse(response);
    const streamEventRepository = new PrismaAgentStreamEventRepository(prisma);
    const appended = await streamEventRepository.append({
      threadId,
      type: event.type,
      payload: event as unknown as Record<string, unknown>,
    });
    createChatEmitter(threadId)?.emitStreamEventRaw(event, appended.seq);
  }
