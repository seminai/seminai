import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { getWorkingMemory } from '../working-memory';
import { prisma } from '../../../../repositories/Prisma';
import { AgentResponseStatus, MessageRole } from '@prisma/client';
import { rejectAndRespond } from '../../field_note_agent/ChatFieldNoteAgent';
import { LOG_PREFIX, resolveFieldNoteApp } from './delegate-field-note.tool.part-01-log-prefix';

/**
 * Tool: reject_field_note
 *
 * Rejects pending field note operations and sends user feedback/corrections
 * to the field note agent. The agent will re-analyze and propose new operations.
 */
export function createRejectFieldNoteTool(threadId: string, userId: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'reject_field_note',
    description: `Rifiuta le operazioni pendenti dell'agente Note di Campo e invia il feedback dell'utente.
L'agente ri-analizzerà la richiesta con le correzioni fornite e proporrà una nuova classificazione.
Usa quando l'utente dice "no", corregge un dato (campo sbagliato, quantità diversa, ecc.),
o chiede di modificare la proposta.`,
    schema: z.object({
      feedback: z
        .string()
        .describe(
          "Feedback o correzione dell'utente (es. 'il campo era vigneto sud, non nord', 'la quantità era 5 kg non 10')",
        ),
    }),
    func: async ({ feedback }) => {
      try {
        const wm = getWorkingMemory(threadId);

        if (!wm.fieldNoteThreadId) {
          return JSON.stringify({
            error: 'Nessuna operazione pendente da rifiutare',
            hint: 'Chiama prima delegate_to_field_note per classificare il messaggio.',
          });
        }

        const { app, fieldNoteThreadId, chatId, registry } = await resolveFieldNoteApp(
          threadId,
          userId,
        );

        console.log(`${LOG_PREFIX} Rejecting with feedback: "${feedback}"`);
        await registry.saveMessage(prisma, chatId, MessageRole.USER, feedback, {
          metadata: { action: 'REJECT' },
        });
        const response = await rejectAndRespond(app, fieldNoteThreadId, feedback);

        console.log(`${LOG_PREFIX} Reject response status: ${response.status}`);

        if (response.status === 'REQUIRES_APPROVAL') {
          await registry.saveMessage(
            prisma,
            chatId,
            MessageRole.ASSISTANT,
            response.message ?? '',
            {
              status: AgentResponseStatus.REQUIRES_APPROVAL,
              pendingToolCalls: response.pendingToolCalls,
            },
          );
          return JSON.stringify({
            status: 'REQUIRES_APPROVAL',
            message: response.message,
            pendingOperations: response.pendingToolCalls?.map((tc) => ({
              type: tc.name,
              details: tc.args,
            })),
            hint: "Nuova proposta dopo il feedback. Presenta il riepilogo aggiornato all'utente.",
          });
        }

        await registry.saveMessage(prisma, chatId, MessageRole.ASSISTANT, response.message ?? '', {
          status:
            response.status === 'ERROR' ? AgentResponseStatus.ERROR : AgentResponseStatus.COMPLETED,
          error: response.error,
        });

        if (response.status === 'ERROR') {
          return JSON.stringify({
            status: 'ERROR',
            error: response.error,
          });
        }

        return JSON.stringify({
          status: 'COMPLETED',
          message: response.message,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Errore sconosciuto';
        console.error(`${LOG_PREFIX} Error rejecting:`, error);
        return JSON.stringify({ status: 'ERROR', error: msg });
      }
    },
  });
}
