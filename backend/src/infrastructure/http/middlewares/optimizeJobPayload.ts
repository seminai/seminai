import { Request, Response, NextFunction } from 'express';
import { JobWithAssignmentDTO } from '../../../domain/dtos/job-assignment.dto';

/**
 * Middleware to optimize job payload by reducing history size.
 * Keeps only the most recent history entries to reduce payload size.
 */
export function optimizeJobPayload(req: Request, _res: Response, next: NextFunction): void {
  if (req.body?.jobs && Array.isArray(req.body.jobs)) {
    const maxHistoryEntries = 10; // Keep only last 10 history entries per job

    // Calculate original size before optimization
    const originalSize = JSON.stringify(req.body).length;

    req.body.jobs = req.body.jobs.map((job: JobWithAssignmentDTO) => {
      if (job.job?.history && Array.isArray(job.job.history)) {
        const history = job.job.history;
        if (history.length > maxHistoryEntries) {
          // Keep only the most recent entries
          const optimizedHistory = history.slice(-maxHistoryEntries);
          return {
            ...job,
            job: {
              ...job.job,
              history: optimizedHistory,
            },
          };
        }
      }
      return job;
    });

    // Calculate optimized size after optimization
    const optimizedSize = JSON.stringify(req.body).length;
    const reduction = originalSize > 0 ? ((originalSize - optimizedSize) / originalSize) * 100 : 0;

    if (reduction > 0) {
      console.log(
        `[PAYLOAD-OPTIMIZATION] Reduced payload by ${reduction.toFixed(2)}% (${(originalSize / 1024).toFixed(2)}KB -> ${(optimizedSize / 1024).toFixed(2)}KB)`,
      );
    }
  }

  next();
}
