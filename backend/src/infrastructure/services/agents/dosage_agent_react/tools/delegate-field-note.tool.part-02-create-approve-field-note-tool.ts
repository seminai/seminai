import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { getWorkingMemory, updateWorkingMemory } from '../working-memory';
import { prisma } from '../../../../repositories/Prisma';
import { AgentResponseStatus, MessageRole } from '@prisma/client';
import { approveAndExecute } from '../../field_note_agent/ChatFieldNoteAgent';
import { LOG_PREFIX, hasCreatedRows, resolveFieldNoteApp } from './delegate-field-note.tool.part-01-log-prefix';

/**
 * Tool: approve_field_note
 *
 * Approves and executes pending field note operations (save_field_note,
 * save_stock_in_purchase, etc.) after user confirmation.
 * This tool is DESTRUCTIVE and goes through the approval_gate.
 */
export function createApproveFieldNoteTool(
  threadId: string,
  userId: string,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'approve_field_note',
    description: `Approva e esegue le operazioni pendenti dell'agente Note di Campo.
⚠️ QUESTO TOOL RICHIEDE APPROVAZIONE ESPLICITA DELL'UTENTE.
Chiama questo tool SOLO dopo che l'utente ha confermato il riepilogo presentato da delegate_to_field_note.
Esegue il salvataggio nel database (note di campo, movimenti magazzino).`,
    schema: z.object({}),
    func: async () => {
      try {
        const wm = getWorkingMemory(threadId);

        if (!wm.fieldNoteThreadId) {
          return JSON.stringify({
            status: 'COMPLETED',
            message: 'Nessuna operazione pendente da approvare.',
            hint: "Non ci sono operazioni in attesa. Comunica all'utente che non c'è nulla da approvare.",
          });
        }

        const { app, fieldNoteThreadId, chatId, registry } = await resolveFieldNoteApp(
          threadId,
          userId,
        );

        console.log(`${LOG_PREFIX} Approving field note operations`);
        await registry.saveMessage(
          prisma,
          chatId,
          MessageRole.USER,
          'User approved the pending tool execution.',
          { metadata: { action: 'APPROVE' } },
        );
        const response = await approveAndExecute(app, fieldNoteThreadId, prisma, userId);

        console.log(`${LOG_PREFIX} Approve response status: ${response.status}`);

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
            hint: "Ci sono altre operazioni pendenti. Presenta il riepilogo all'utente.",
          });
        }

        if (response.status === 'ERROR') {
          await registry.saveMessage(prisma, chatId, MessageRole.ASSISTANT, response.error ?? '', {
            status: AgentResponseStatus.ERROR,
            error: response.error,
          });
          return JSON.stringify({
            status: 'ERROR',
            error: response.error,
            hint: 'Comunica che il salvataggio non e riuscito e non dire che e stato registrato.',
          });
        }

        // Clear field note link from working memory after successful completion
        // to prevent the main agent from calling approve_field_note again in a loop.
        updateWorkingMemory(threadId, {
          fieldNoteThreadId: undefined,
          fieldNoteChatId: undefined,
        });
        console.log(`${LOG_PREFIX} Cleared field note link from working memory after completion`);

        await registry.saveMessage(prisma, chatId, MessageRole.ASSISTANT, response.message ?? '', {
          status: AgentResponseStatus.COMPLETED,
        });

        if (!hasCreatedRows(response)) {
          return JSON.stringify({
            status: 'NO_OP',
            message:
              response.message ??
              'Nessuna operazione pendente da approvare: non e stato creato alcun record.',
            hint: 'Non dire che il trattamento e stato registrato. Spiega che non c era un salvataggio pendente e chiedi di riprovare.',
          });
        }

        return JSON.stringify({
          status: 'COMPLETED',
          message: response.message,
          createdFieldNoteIds: response.createdFieldNoteIds,
          createdStockIds: response.createdStockIds,
          hint:
            "Operazione completata con successo. Comunica il risultato all'utente. " +
            'NON chiamare di nuovo approve_field_note — il salvataggio è già avvenuto.',
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Errore sconosciuto';
        console.error(`${LOG_PREFIX} Error approving:`, error);
        return JSON.stringify({ status: 'ERROR', error: msg });
      }
    },
  });
}
