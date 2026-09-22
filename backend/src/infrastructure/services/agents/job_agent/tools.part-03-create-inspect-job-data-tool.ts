import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { getObject, readPath, truncateValue } from './tools.part-02-create-disciplinari-search-tool';

/**
 * Creates a tool to inspect nested job data structures.
 * This allows the agent to explore alertNotes, history, and other nested objects.
 * Returns COMPACT results to avoid context overflow.
 */
export const createInspectJobDataTool = (jobs: { job: Record<string, unknown> }[]) => {
  return new DynamicStructuredTool({
    name: 'inspect_job_data',
    description: `Ispeziona i dati annidati di un job specifico. Usa questo tool per esplorare:
- alertNotes: contiene dati estratti dall'etichetta (dose_minima, dose_massima, resistenze, frasi_pericolo, note_tecniche, etc.)
- history: array con la cronologia delle decisioni prese (crop_matching, dosage_scheduling, dosage_optimization)
- note: reasoning del calcolo della dose
Questo tool è ESSENZIALE per rispondere a domande sul calcolo delle quantità e sulle decisioni prese.
NOTA: I risultati sono troncati per efficienza. Per dati completi, richiedi path specifici.`,
    schema: z.object({
      jobId: z.string().describe("L'ID del job da ispezionare"),
      path: z
        .string()
        .describe(
          'Il path da esplorare, es: "alertNotes", "history", "alertNotes.resistenze", "history[0].metadata"',
        ),
    }),
    func: async ({ jobId, path }) => {
      try {
        const jobData = jobs.find((j) => j.job.id === jobId);
        if (!jobData) {
          return `Job con ID "${jobId}" non trovato. ID disponibili: ${jobs.map((j) => j.job.id).join(', ')}`;
        }

        const parts = path.split('.');
        const resolved = readPath(jobData.job, parts);
        const current = resolved.value;
        if (resolved.failedAt) {
          return `Path "${path}" non trovato al segmento "${resolved.failedAt}"`;
        }

        if (current === undefined) {
          const parentParts = parts.slice(0, -1);
          const parent = readPath(jobData.job, parentParts).value;
          const availableKeys = Object.keys(getObject(parent) ?? {});
          return `Path "${path}" non trovato. Chiavi disponibili: ${availableKeys.join(', ')}`;
        }

        // Format the result with truncation for large values
        const truncatedValue = truncateValue(current, 300);

        const result = {
          path,
          type: Array.isArray(current) ? 'array' : typeof current,
          value: truncatedValue,
          ...(Array.isArray(current) && { length: current.length }),
          ...(typeof current === 'object' &&
            current !== null &&
            !Array.isArray(current) && {
              keys: Object.keys(current),
            }),
        };

        return JSON.stringify(result, null, 2);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return `Errore nell'ispezione: ${errorMessage}`;
      }
    },
  });
};

/**
 * Creates a tool to get a COMPACT summary of available data paths in a job.
 * Returns only key paths to minimize context usage.
 */
export const createListJobPathsTool = (jobs: { job: Record<string, unknown> }[]) => {
  return new DynamicStructuredTool({
    name: 'list_job_paths',
    description:
      "Elenca i path principali disponibili in un job. Ritorna una SINTESI compatta. Usa 'inspect_job_data' per i dettagli specifici.",
    schema: z.object({
      jobId: z.string().describe("L'ID del job da esplorare"),
    }),
    func: async ({ jobId }) => {
      const jobData = jobs.find((j) => j.job.id === jobId);
      if (!jobData) {
        return `Job con ID "${jobId}" non trovato. ID disponibili: ${jobs.map((j) => j.job.id).join(', ')}`;
      }

      const job = jobData.job;

      // Build a compact summary of key paths only
      const keyPaths: string[] = [];
      const summary: Record<string, string> = {};

      // Check for note
      if (job.note) {
        keyPaths.push('note');
        const noteStr = String(job.note);
        summary.note = noteStr.length > 100 ? noteStr.substring(0, 100) + '...' : noteStr;
      }

      // Check for alertNotes
      if (job.alertNotes && typeof job.alertNotes === 'object') {
        const alertKeys = Object.keys(job.alertNotes as Record<string, unknown>);
        keyPaths.push('alertNotes');
        summary.alertNotes = `Campi: ${alertKeys.slice(0, 8).join(', ')}${alertKeys.length > 8 ? ` (+${alertKeys.length - 8} altri)` : ''}`;
      }

      // Check for history
      if (job.history && Array.isArray(job.history)) {
        const historyArr = job.history as Array<{ step?: string; title?: string }>;
        keyPaths.push('history');
        summary.history = `${historyArr.length} voci: ${historyArr
          .slice(0, 3)
          .map((h) => h.step || h.title || '?')
          .join(', ')}${historyArr.length > 3 ? '...' : ''}`;
      }

      // Add other important scalar fields
      const importantFields = [
        'quantity',
        'treatedSurface',
        'category',
        'isVerified',
        'conformityChecked',
      ];
      for (const field of importantFields) {
        if (job[field] !== undefined && job[field] !== null) {
          keyPaths.push(field);
          summary[field] = String(job[field]).substring(0, 50);
        }
      }

      return JSON.stringify({
        jobId,
        keyPaths,
        summary,
        hint: "Usa inspect_job_data con path specifici (es. 'note', 'alertNotes', 'history') per dettagli",
      });
    },
  });
};

/**
 * Creates a tool to propose job modifications (requires human approval).
 */
export const createProposeJobModificationTool = () => {
  return new DynamicStructuredTool({
    name: 'propose_job_modification',
    description:
      'Proposes a modification to a job field. This will require user approval before being applied. Use this when the user asks to change job data. IMPORTANT: After proposing a modification, the job will be marked as conformityChecked=false.',
    schema: z.object({
      jobId: z.string().describe('The ID of the job to modify'),
      field: z
        .string()
        .describe('The field name to modify (e.g., "quantity", "note", "avversity")'),
      oldValue: z.string().describe('The current value of the field (for reference)'),
      newValue: z.string().describe('The new value to set'),
      reason: z.string().describe('The reason for this modification'),
    }),
    func: async ({ jobId, field, oldValue, newValue, reason }) => {
      // This tool doesn't actually modify the job - it just returns the proposed modification
      // The actual modification will be done after user approval
      return JSON.stringify(
        {
          type: 'MODIFICATION_PROPOSAL',
          jobId,
          field,
          oldValue,
          newValue,
          reason,
          warning:
            'This modification requires user approval. After approval, the job will be marked as conformityChecked=false.',
        },
        null,
        2,
      );
    },
  });
};
