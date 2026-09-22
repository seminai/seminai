import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { UpdateJobUseCase } from '../../../../../../application/use-cases/job/UpdateJobUseCase';
import { ModifyingUserInfo } from '../../../../../../domain/dtos/job-modification.dto';
import type { JobModificationToolOptions } from './job-modification.tool';

/**
 * Tool: merge_treatment_dates
 * Moves multiple jobs to the same target date. DESTRUCTIVE — requires user approval.
 */
export const createMergeTreatmentDatesTool = (
  options: JobModificationToolOptions,
): DynamicStructuredTool => {
  const { userId, userInfo, jobRepository, stockRepository } = options;
  const useCase = new UpdateJobUseCase(jobRepository, stockRepository);

  return new DynamicStructuredTool({
    name: 'merge_treatment_dates',
    description: `Sposta più job agricoli alla stessa data target, unificando le date di trattamento.
⚠️ RICHIEDE APPROVAZIONE DELL'UTENTE.
Cambia SOLO la data — stock, quantità e altri campi restano invariati.
Trigger: "unisci", "accorpa", "sposta alla stessa data", "raggruppali".
Usa search_job_operations o get_job_details PRIMA per trovare i job ID.`,
    schema: z.object({
      jobIds: z.array(z.string()).min(2).describe('Array di job UUID da spostare (minimo 2)'),
      targetDate: z.string().describe('Data target ISO 8601 (es. 2025-06-15T00:00:00.000Z)'),
      reason: z
        .string()
        .describe('Giustificazione obbligatoria. Registrata nello storico di ogni job.'),
    }),
    func: async (input) => {
      try {
        const parsedDate = new Date(input.targetDate);
        if (isNaN(parsedDate.getTime())) {
          return `ERROR: Data target non valida "${input.targetDate}". Fornire ISO 8601.`;
        }

        const modifiedBy: ModifyingUserInfo = {
          userId,
          name: userInfo.name,
          email: userInfo.email,
        };
        const updated: string[] = [];
        const skipped: string[] = [];
        const failed: string[] = [];

        for (const [index, jobId] of input.jobIds.entries()) {
          const operationLabel = `Operazione ${index + 1}`;
          try {
            const existing = await jobRepository.findById(jobId);
            if (!existing) {
              failed.push(`- ${operationLabel}: non trovata`);
              continue;
            }

            const existingDateStr = existing.dateOfOpeation.toISOString().split('T')[0];
            const targetDateStr = parsedDate.toISOString().split('T')[0];
            if (existingDateStr === targetDateStr) {
              skipped.push(
                `- ${operationLabel}: già alla data ${existing.dateOfOpeation.toLocaleDateString('it-IT')}`,
              );
              continue;
            }

            const oldDate = existing.dateOfOpeation.toLocaleDateString('it-IT');
            await useCase.execute({
              id: jobId,
              modifiedBy,
              data: { dateOfOpeation: parsedDate },
            });
            const newDate = parsedDate.toLocaleDateString('it-IT');
            updated.push(`- ${operationLabel}: ${oldDate} → ${newDate}`);
          } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            failed.push(`- ${operationLabel}: ${msg}`);
          }
        }

        const targetDateFormatted = parsedDate.toLocaleDateString('it-IT');
        const total = input.jobIds.length;

        let result = `UNIFICAZIONE DATE COMPLETATA:\nData target: ${targetDateFormatted}\nMotivo: "${input.reason}"\nModificato da: ${userInfo.name} (${userInfo.email})\n`;
        result += `\nAGGIORNATI (${updated.length}/${total}):\n`;
        result += updated.length > 0 ? updated.join('\n') : '(nessuno)';

        if (skipped.length > 0) {
          result += `\n\nSALTATI (${skipped.length}/${total}):\n${skipped.join('\n')}`;
        }
        if (failed.length > 0) {
          result += `\n\nFALLITI (${failed.length}/${total}):\n${failed.join('\n')}`;
        }

        return result;
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        return `ERROR unificazione date: ${msg}`;
      }
    },
  });
};
