import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { UpdateJobUseCase } from '../../../../application/use-cases/job/UpdateJobUseCase';
import { ModifyingUserInfo } from '../../../../domain/dtos/job-modification.dto';
import { JobModificationToolOptions } from './tools-job-modification';

/**
 * Creates a tool that moves multiple jobs to the same target date in a single call.
 * Useful when the user wants to "merge" or "unify" treatments on one application date.
 * All changes are tracked in each job's history with full diff and user attribution.
 */
export const createMergeTreatmentDatesTool = (
  options: JobModificationToolOptions,
): DynamicStructuredTool => {
  const { userId, userInfo, jobRepository, stockRepository } = options;
  const useCase = new UpdateJobUseCase(jobRepository, stockRepository);

  return new DynamicStructuredTool({
    name: 'merge_treatment_dates',
    description: `Moves multiple agricultural jobs (treatments) to the same target date, effectively merging them on a single application day.
Use this tool when the user asks to unify, merge, or group multiple treatments on the same date.
Trigger phrases: "unisci", "accorpa", "sposta alla stessa data", "metti tutti il", "stessa data", "unifica le date", "raggruppali".

IMPORTANT:
1. Always use search_job_operations or get_job_details FIRST to find the correct job IDs.
2. Confirm the target date with the user if not explicitly specified.
3. The "reason" field is mandatory and will be recorded in each job's history.
4. This tool only changes dates — stocks, quantities, and other fields remain unchanged.`,
    schema: z.object({
      jobIds: z
        .array(z.string())
        .min(2)
        .describe('Array of job UUIDs to move to the same date. Must contain at least 2 IDs.'),
      targetDate: z
        .string()
        .describe(
          'The target date in ISO 8601 format (e.g. 2025-06-15T00:00:00.000Z). All jobs will be moved to this date.',
        ),
      reason: z
        .string()
        .describe(
          'Mandatory justification for the date merge. Will be recorded in each job\'s history (e.g. "User requested merging 3 treatments to single application date 2025-06-15").',
        ),
    }),
    func: async (input) => {
      try {
        const parsedDate = new Date(input.targetDate);
        if (isNaN(parsedDate.getTime())) {
          return `ERROR: Invalid target date "${input.targetDate}". Please provide a valid ISO 8601 date (e.g. 2025-06-15T00:00:00.000Z).`;
        }

        const modifiedBy: ModifyingUserInfo = {
          userId,
          name: userInfo.name,
          email: userInfo.email,
        };

        const updated: string[] = [];
        const skipped: string[] = [];
        const failed: string[] = [];

        for (const jobId of input.jobIds) {
          try {
            const existing = await jobRepository.findById(jobId);
            if (!existing) {
              failed.push(`- Job ${jobId}: not found`);
              continue;
            }

            const existingDateStr = existing.dateOfOpeation.toISOString().split('T')[0];
            const targetDateStr = parsedDate.toISOString().split('T')[0];
            if (existingDateStr === targetDateStr) {
              skipped.push(
                `- Job ${jobId}: already on ${existing.dateOfOpeation.toLocaleDateString('it-IT')}`,
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
            updated.push(`- Job ${jobId}: ${oldDate} → ${newDate}`);
          } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            failed.push(`- Job ${jobId}: ${msg}`);
          }
        }

        const targetDateFormatted = parsedDate.toLocaleDateString('it-IT');
        const total = input.jobIds.length;

        let result = `MERGE TREATMENT DATES COMPLETED:\nTarget date: ${targetDateFormatted}\nReason: "${input.reason}"\nModified by: ${userInfo.name} (${userInfo.email})\n`;

        result += `\nUPDATED (${updated.length}/${total}):\n`;
        result += updated.length > 0 ? updated.join('\n') : '(none)';

        if (skipped.length > 0) {
          result += `\n\nSKIPPED (${skipped.length}/${total}):\n${skipped.join('\n')}`;
        }

        if (failed.length > 0) {
          result += `\n\nFAILED (${failed.length}/${total}):\n${failed.join('\n')}`;
        }

        return result;
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        return `ERROR merging treatment dates: ${msg}`;
      }
    },
  });
};
