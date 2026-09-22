import type { AgentResponse } from '../../services/agents/dosage_agent_react/DosageReactAgent';
import { AgentResponseStatus as MessageStatus } from '../../../domain/entities/Message';
import type { AgentChatControllerContext } from './agent-chat-controller.context';

export function agentChatControllerMapAgentStatus(this: AgentChatControllerContext, status: AgentResponse['status']): MessageStatus {
    switch (status) {
      case 'COMPLETED':
        return MessageStatus.COMPLETED;
      case 'REQUIRES_APPROVAL':
        return MessageStatus.REQUIRES_APPROVAL;
      case 'CANCELLED':
        return MessageStatus.CANCELLED;
      case 'ERROR':
      default:
        return MessageStatus.ERROR;
    }
  }
