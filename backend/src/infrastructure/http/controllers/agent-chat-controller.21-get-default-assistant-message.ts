import { AgentResponseStatus as MessageStatus } from '../../../domain/entities/Message';
import type { AgentChatControllerContext } from './agent-chat-controller.context';

export function agentChatControllerGetDefaultAssistantMessage(this: AgentChatControllerContext, status: MessageStatus): string {
    if (status === MessageStatus.REQUIRES_APPROVAL) {
      return 'The agent is awaiting approval to execute a tool.';
    }

    if (status === MessageStatus.ERROR) {
      return 'The agent encountered an error while processing the request.';
    }

    if (status === MessageStatus.CANCELLED) {
      return "Risposta annullata dall'utente.";
    }

    return 'No response generated.';
  }
