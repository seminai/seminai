import { AgentResponseStatus as MessageStatus } from '../../../domain/entities/Message';
import type { JobVerificationAgentControllerContext } from './job-verification-agent-controller.context';

export function jobVerificationAgentControllerGetDefaultAssistantMessage(this: JobVerificationAgentControllerContext, status: MessageStatus): string {
    if (status === MessageStatus.REQUIRES_APPROVAL) {
      return "L'agente richiede la tua approvazione per procedere.";
    }

    if (status === MessageStatus.ERROR) {
      return "Si è verificato un errore durante l'elaborazione della richiesta.";
    }

    return 'Elaborazione completata.';
  }
