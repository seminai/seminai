import { AgentResponseStatus as MessageStatus } from '../../../domain/entities/Message';
import type { JobVerificationAgentControllerContext } from './job-verification-agent-controller.context';

export function jobVerificationAgentControllerMapAgentStatus(this: JobVerificationAgentControllerContext, status:
      | 'COMPLETED'
      | 'REQUIRES_APPROVAL'
      | 'REQUIRES_MODIFICATION_APPROVAL'
      | 'PROCESSING'
      | 'ERROR'): MessageStatus {
    switch (status) {
      case 'COMPLETED':
        return MessageStatus.COMPLETED;
      case 'REQUIRES_APPROVAL':
      case 'REQUIRES_MODIFICATION_APPROVAL':
        return MessageStatus.REQUIRES_APPROVAL;
      case 'PROCESSING':
        return MessageStatus.COMPLETED; // Map to completed for now
      case 'ERROR':
      default:
        return MessageStatus.ERROR;
    }
  }
