import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { updateWorkingMemory } from '../working-memory';
import type { Questionnaire, Question, QuestionType } from '../type/questionnaire';
import { OuterLoopService } from '../outer-loop/outer-loop.service';
import { getOuterLoopProcessorQueue } from '../../../../queue/OuterLoopProcessorQueue';

/** Delay before sending a questionnaire reminder (15 minutes). */
const QUESTIONNAIRE_REMINDER_DELAY_MS = 15 * 60 * 1000;

/**
 * Tool: ask_user_questions
 * Presents structured questions with predefined options to the user.
 * Stores the questionnaire in working memory for the streaming layer
 * to emit as a `questionnaire_presented` SSE event.
 *
 * NON-destructive — runs in the normal ReAct loop without approval gate.
 * The agent should STOP and wait for user answers after calling this tool.
 */
export function createAskUserQuestionsTool(
  threadId: string,
  userId?: string,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'ask_user_questions',
    description: `Presenta domande strutturate all'utente con opzioni predefinite per raccogliere informazioni prima di procedere.
Usa questo tool quando l'utente chiede di pianificare o creare un piano ma non ha specificato tutti i dettagli necessari.
IMPORTANTE: Dopo aver chiamato questo tool, la tua risposta deve SOLO invitare l'utente a rispondere alle domande.
NON procedere con il piano finché l'utente non ha risposto.

Le opzioni devono essere basate su DATI REALI già scoperti (da list_production_units, list_company_products, ecc.).
Ogni domanda di tipo single_select o multi_select deve avere 2-4 opzioni concrete.
L'utente può sempre digitare un testo libero per personalizzare la risposta.`,
    schema: z.object({
      title: z
        .string()
        .describe('Titolo del questionario (es. "Informazioni per il piano di distribuzione")'),
      description: z
        .string()
        .optional()
        .describe('Descrizione/contesto opzionale del questionario'),
      questions: z
        .array(
          z.object({
            id: z
              .string()
              .describe(
                'Identificativo unico della domanda (es. "target_units", "timing", "priority")',
              ),
            question: z.string().describe('Testo della domanda'),
            type: z
              .enum(['single_select', 'multi_select', 'text'])
              .describe(
                'Tipo di risposta: single_select (una scelta), multi_select (più scelte), text (testo libero)',
              ),
            options: z
              .array(
                z.object({
                  label: z
                    .string()
                    .describe('Testo mostrato all\'utente (es. "Vigneto Nord - 12.5 ha (Vite)")'),
                  value: z.string().describe('Valore della selezione (es. ID o codice)'),
                  description: z.string().optional().describe('Dettaglio opzionale'),
                }),
              )
              .optional()
              .describe('Opzioni predefinite (obbligatorio per single_select e multi_select)'),
            required: z.boolean().describe('Se la risposta è obbligatoria'),
            placeholder: z.string().optional().describe('Placeholder per domande di tipo text'),
          }),
        )
        .describe('Lista delle domande da presentare (max 5)'),
    }),
    func: async ({ title, description, questions }) => {
      const questionnaire: Questionnaire = {
        title,
        description,
        questions: questions.map(
          (q: {
            id: string;
            question: string;
            type: string;
            options?: { label: string; value: string; description?: string }[];
            required: boolean;
            placeholder?: string;
          }): Question => ({
            id: q.id,
            question: q.question,
            type: q.type as QuestionType,
            options: q.options,
            required: q.required,
            placeholder: q.placeholder,
          }),
        ),
      };

      // Store in working memory for the streaming layer to pick up and emit as SSE event
      updateWorkingMemory(threadId, { pendingQuestionnaire: questionnaire });

      // Schedule a reminder if the user doesn't respond
      if (userId) {
        scheduleQuestionnaireReminder(userId, threadId, title).catch((err) => {
          console.warn('[ask-user-questions] Failed to schedule reminder:', err);
        });
      }

      // Return summary for the agent's context
      const questionSummary = questions
        .map(
          (q: { question: string; type: string; options?: unknown[] }, i: number) =>
            `${i + 1}. ${q.question} (${q.type}${q.options ? `, ${q.options.length} opzioni` : ''})`,
        )
        .join('\n');

      return JSON.stringify({
        success: true,
        questionnaireStored: true,
        title,
        questionCount: questions.length,
        summary: questionSummary,
        workingMemoryKey: 'pendingQuestionnaire',
        instruction:
          "Il questionario è stato preparato e verrà presentato all'utente come UI interattiva. " +
          "Nella tua risposta, invita l'utente a rispondere alle domande selezionando le opzioni. " +
          "NON procedere con il piano finché l'utente non ha risposto.",
      });
    },
  });
}

/**
 * Schedules a questionnaire reminder via outer-loop trigger + BullMQ delayed job.
 * The reminder fires after QUESTIONNAIRE_REMINDER_DELAY_MS if the user hasn't responded.
 */
async function scheduleQuestionnaireReminder(
  userId: string,
  threadId: string,
  questionnaireTitle: string,
): Promise<void> {
  const service = new OuterLoopService();
  const scheduledAt = new Date(Date.now() + QUESTIONNAIRE_REMINDER_DELAY_MS);
  const trigger = await service.scheduleAlert({
    userId,
    type: 'questionnaire_reminder',
    title: `Promemoria: rispondi al questionario "${questionnaireTitle}"`,
    payload: { questionnaireTitle, threadId },
    scheduledAt,
    threadId,
  });
  try {
    const queue = getOuterLoopProcessorQueue();
    await queue.queue.add(
      'execute-trigger',
      { triggerId: trigger.id },
      {
        delay: QUESTIONNAIRE_REMINDER_DELAY_MS,
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 7200 },
        jobId: `questionnaire-reminder-${trigger.id}`,
      },
    );
  } catch (error) {
    console.warn('[ask-user-questions] Failed to enqueue reminder job:', error);
  }
}
