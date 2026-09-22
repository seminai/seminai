import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { getWorkingMemory, updateWorkingMemory } from '../working-memory';
import { getFieldNoteAgentRegistry } from '../../field_note_agent/FieldNoteAgentRegistry';
import {
  handleUserMessage,
  approveAndExecute,
  rejectAndRespond,
} from '../../field_note_agent/ChatFieldNoteAgent';
import { prisma } from '../../../../repositories/Prisma';
import { buildHumanReadableSummary } from './field-note-summary';
import { AgentResponseStatus, MessageRole } from '@prisma/client';

const LOG_PREFIX = '[DosageReact→FieldNote]';

/**
 * Resolves the field note agent app for the parent thread. The app instance is
 * never persisted in working memory (it is a non-serializable Runnable);
 * lookups always go through FieldNoteAgentRegistry, which is idempotent per
 * threadId and hydrates conversation history from Prisma on cache miss. Only
 * the serializable `fieldNoteThreadId` and `fieldNoteChatId` are written to WM,
 * so they survive TTL eviction + DB hydration.
 */
async function resolveFieldNoteApp(threadId: string, userId: string) {
  const wm = getWorkingMemory(threadId);
  const fieldNoteThreadId = wm.fieldNoteThreadId ?? `${threadId}-fieldnote`;

  const registry = getFieldNoteAgentRegistry();
  const { app, chatId } = await registry.getOrCreateApp({
    threadId: fieldNoteThreadId,
    userId,
    prisma,
    modelName: 'gpt-4o',
  });

  if (!wm.fieldNoteThreadId || wm.fieldNoteChatId !== chatId) {
    updateWorkingMemory(threadId, {
      fieldNoteThreadId,
      fieldNoteChatId: chatId,
    });
    console.log(`${LOG_PREFIX} Linked field note thread in WM: ${fieldNoteThreadId}`);
  }

  return { app, fieldNoteThreadId, chatId, registry };
}

function hasCreatedRows(response: {
  createdFieldNoteIds?: readonly string[];
  createdStockIds?: readonly string[];
}): boolean {
  return (
    (response.createdFieldNoteIds?.length ?? 0) > 0 || (response.createdStockIds?.length ?? 0) > 0
  );
}

/**
 * Tool: delegate_to_field_note
 *
 * Delegates a user message to the field note agent for classification,
 * field/product matching, and save proposal. Returns the agent's response
 * which may include a summary requiring user approval.
 */
export function createDelegateToFieldNoteTool(
  threadId: string,
  userId: string,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'delegate_to_field_note',
    description: `Delega un messaggio all'agente Note di Campo per classificare, registrare o interrogare:
- Note di campo (trattamenti fatti, osservazioni, malattie, danni)
- Movimenti di magazzino (acquisti, vendite, raccolti)
- Consultazione prodotti autorizzati per avversità (BDF)
- Interrogazioni su note di campo già registrate (conteggio, elenco, dettaglio di una nota specifica)

Usa questo tool quando l'utente descrive operazioni già effettuate ("ho dato", "ho trattato", "ho applicato"),
osservazioni di campo ("ho visto", "ho notato"), movimenti di magazzino ("ho comprato", "ho venduto", "ho raccolto"),
chiede quali prodotti usare per una specifica avversità ("cosa posso dare per l'oidio sulla vite?"),
o chiede informazioni sulle note di campo già registrate ("quante note ho", "mostrami le note di aprile",
"dettagli della nota di ieri").

Per domande generiche sullo storico trattamenti/operazioni fatte, usa list_done_operations: quello combina
operazioni verificate in Archivio e note di campo.

NON usare per pianificazione dosaggi futuri — per quello usa il workflow standard.

Il tool restituisce un riepilogo strutturato. Se lo status è REQUIRES_APPROVAL,
presenta il riepilogo (campo "summary") all'utente e chiama IMMEDIATAMENTE approve_field_note nella stessa risposta.
NON mostrare MAI UUID o ID tecnici — usa solo i nomi leggibili dal riepilogo.`,
    schema: z.object({
      message: z
        .string()
        .describe(
          "Il messaggio dell'utente da delegare all'agente note di campo (in italiano, testo libero)",
        ),
    }),
    func: async ({ message }) => {
      try {
        const { app, fieldNoteThreadId, chatId, registry } = await resolveFieldNoteApp(
          threadId,
          userId,
        );

        const today = new Date().toLocaleDateString('it-IT', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
        const enrichedMessage = `${message}\n\n[Contesto: oggi è ${today}]`;

        console.log(`${LOG_PREFIX} Delegating message: "${enrichedMessage}"`);
        await registry.saveMessage(prisma, chatId, MessageRole.USER, enrichedMessage);
        const response = await handleUserMessage(app, fieldNoteThreadId, enrichedMessage);

        console.log(`${LOG_PREFIX} Response status: ${response.status}`);

        if (response.status === 'REQUIRES_APPROVAL') {
          const summary = response.pendingToolCalls
            ? await buildHumanReadableSummary(prisma, response.pendingToolCalls)
            : '';
          const operationCount = response.pendingToolCalls?.length ?? 1;

          await registry.saveMessage(
            prisma,
            chatId,
            MessageRole.ASSISTANT,
            response.message || summary,
            {
              status: AgentResponseStatus.REQUIRES_APPROVAL,
              pendingToolCalls: response.pendingToolCalls,
            },
          );
          return JSON.stringify({
            status: 'REQUIRES_APPROVAL',
            operationCount,
            summary,
            hint:
              'Presenta il riepilogo delle operazioni all\'utente (usa SOLO i dati del campo "summary", ' +
              'MAI mostrare UUID o ID tecnici) e chiama IMMEDIATAMENTE approve_field_note nella stessa risposta. ' +
              "L'approval gate mostrerà i bottoni Approva/Rifiuta all'utente. " +
              "Se l'utente rifiuta tramite il bottone, riceverai il feedback e dovrai chiamare reject_field_note.",
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
            hint: "Comunica l'errore all'utente e chiedi di riformulare.",
          });
        }

        await registry.saveMessage(prisma, chatId, MessageRole.ASSISTANT, response.message ?? '', {
          status: AgentResponseStatus.COMPLETED,
        });
        return JSON.stringify({
          status: 'COMPLETED',
          message: response.message,
          hint:
            "L'agente ha risposto SENZA proporre un salvataggio. " +
            'Se il messaggio contiene una domanda, disambiguazione o richiesta di chiarimento, ' +
            "presenta il messaggio all'utente e quando risponde chiama NUOVAMENTE delegate_to_field_note " +
            'con la risposta. NON chiamare approve_field_note finché non ricevi status REQUIRES_APPROVAL.',
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Errore sconosciuto';
        console.error(`${LOG_PREFIX} Error delegating:`, error);
        return JSON.stringify({ status: 'ERROR', error: msg });
      }
    },
  });
}

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
