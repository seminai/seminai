import { Request, Response } from 'express';
import { getConformityCheckerQueue } from '../../queue/ConformityCheckerQueue';
import { StartConformityCheckJobUseCase } from '../../../application/use-cases/conformity-check/StartConformityCheckJobUseCase';
import { GetConformityCheckJobStatusUseCase } from '../../../application/use-cases/conformity-check/GetConformityCheckJobStatusUseCase';
import { ConfirmConformityCheckUseCase } from '../../../application/use-cases/conformity-check/ConfirmConformityCheckUseCase';
import { PrismaDosageAgentJobRepository } from '../../repositories/PrismaDosageAgentJobRepository';
import { prisma } from '../../repositories/Prisma';
import { AppError } from '../../../domain/errors/AppError';
import {
  ConformityCheckInput,
  ConfirmConformityCheckInput,
} from '../../services/agents/conformity_checker_agent/types';

/**
 * Controller per la gestione del controllo conformità
 */
export class ConformityCheckerController {
  private startJobUseCase: StartConformityCheckJobUseCase | null = null;
  private getJobStatusUseCase: GetConformityCheckJobStatusUseCase | null = null;
  private readonly confirmUseCase: ConfirmConformityCheckUseCase;

  constructor() {
    this.confirmUseCase = new ConfirmConformityCheckUseCase();
  }

  private initializeUseCases(): void {
    if (this.startJobUseCase && this.getJobStatusUseCase) {
      return;
    }
    const queue = getConformityCheckerQueue();
    const dosageAgentJobRepository = new PrismaDosageAgentJobRepository(prisma);
    this.startJobUseCase = new StartConformityCheckJobUseCase(queue, dosageAgentJobRepository);
    this.getJobStatusUseCase = new GetConformityCheckJobStatusUseCase(
      queue,
      dosageAgentJobRepository,
    );
  }

  private resolveUseCases(): {
    readonly startJobUseCase: StartConformityCheckJobUseCase;
    readonly getJobStatusUseCase: GetConformityCheckJobStatusUseCase;
  } {
    try {
      this.initializeUseCases();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'queue not available';
      throw AppError.internal(`Conformity queue unavailable: ${message}`, 'QUEUE_UNAVAILABLE');
    }
    if (!this.startJobUseCase || !this.getJobStatusUseCase) {
      throw AppError.internal(
        'Conformity queue use-cases are not initialized',
        'QUEUE_UNAVAILABLE',
      );
    }
    return {
      startJobUseCase: this.startJobUseCase,
      getJobStatusUseCase: this.getJobStatusUseCase,
    };
  }

  /**
   * POST /conformity-checker/start-job
   * Avvia un job di controllo conformità in modo asincrono
   *
   * Body:
   * {
   *   "jobGroupId": "uuid-del-gruppo-job",
   *   "notes": "Note agronomiche opzionali dell'utente"
   * }
   */
  public async startJob(request: Request, response: Response): Promise<Response> {
    try {
      if (!request.user?.id) {
        throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
      }

      const body = request.body as Partial<ConformityCheckInput>;

      if (!body.jobGroupId) {
        throw AppError.badRequest('jobGroupId is required', 'MISSING_JOB_GROUP_ID');
      }

      const input: ConformityCheckInput = {
        jobGroupId: body.jobGroupId,
        notes: body.notes,
      };

      const { startJobUseCase } = this.resolveUseCases();
      const result = await startJobUseCase.execute({
        input,
        userId: request.user.id,
      });

      return response.json({
        status: 'success',
        data: {
          jobId: result.jobId,
          message:
            'Conformity check job started successfully. Use /job-status endpoint to check progress.',
        },
      });
    } catch (error) {
      if (error instanceof AppError) {
        return response.status(error.statusCode).json({
          status: 'error',
          message: error.message,
          code: error.code,
        });
      }
      console.error('Error starting conformity check job:', error);
      return response.status(500).json({ status: 'error', message: 'Failed to start job' });
    }
  }

  /**
   * GET /conformity-checker/job-status/:jobId
   * Ottiene lo stato di un job di controllo conformità
   */
  public async getJobStatus(request: Request, response: Response): Promise<Response> {
    try {
      if (!request.user?.id) {
        throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
      }

      const { jobId } = request.params;
      if (!jobId) {
        throw AppError.badRequest('Job ID is required', 'MISSING_JOB_ID');
      }

      const { getJobStatusUseCase } = this.resolveUseCases();
      const result = await getJobStatusUseCase.execute({ jobId });

      // Verifica che l'utente abbia accesso al job
      if (result.data?.userId && result.data.userId !== request.user.id) {
        throw AppError.forbidden('You do not have permission to access this job', 'FORBIDDEN');
      }

      return response.json({ status: 'success', data: result });
    } catch (error) {
      if (error instanceof AppError) {
        return response.status(error.statusCode).json({
          status: 'error',
          message: error.message,
          code: error.code,
        });
      }
      if (error instanceof Error && error.message.includes('not found')) {
        return response.status(200).json({
          status: 'success',
          data: {
            id: request.params.jobId,
            state: 'not_found',
            progress: 0,
            stopPolling: true,
            message: 'Job not found or has been removed. Stop polling.',
          },
        });
      }
      console.error('Error getting job status:', error);
      return response.status(500).json({ status: 'error', message: 'Failed to get job status' });
    }
  }

  /**
   * POST /conformity-checker/confirm
   * Conferma e applica le proposte di conformità
   *
   * Body:
   * {
   *   "jobGroupId": "uuid-del-gruppo-job",
   *   "jobIds": ["uuid-job-1", "uuid-job-2"], // opzionale, se vuoto applica a tutti
   *   "proposals": [...] // le proposte dal risultato del check
   * }
   */
  public async confirm(request: Request, response: Response): Promise<Response> {
    try {
      if (!request.user?.id) {
        throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
      }

      const body = request.body as Partial<ConfirmConformityCheckInput>;

      if (!body.jobGroupId) {
        throw AppError.badRequest('jobGroupId is required', 'MISSING_JOB_GROUP_ID');
      }

      if (!body.proposals || !Array.isArray(body.proposals)) {
        throw AppError.badRequest('proposals array is required', 'MISSING_PROPOSALS');
      }

      const input: ConfirmConformityCheckInput = {
        jobGroupId: body.jobGroupId,
        jobIds: body.jobIds,
        proposals: body.proposals,
      };

      const result = await this.confirmUseCase.execute(input);

      return response.json({
        status: 'success',
        data: {
          ...result,
          message: `Successfully updated ${result.updatedJobsCount} jobs (${result.excludedJobsCount} excluded).`,
        },
      });
    } catch (error) {
      if (error instanceof AppError) {
        return response.status(error.statusCode).json({
          status: 'error',
          message: error.message,
          code: error.code,
        });
      }
      console.error('Error confirming conformity check:', error);
      return response
        .status(500)
        .json({ status: 'error', message: 'Failed to confirm conformity check' });
    }
  }

  /**
   * DELETE /conformity-checker/jobs/:jobId
   * Cancella un job dalla coda
   */
  public async deleteJob(request: Request, response: Response): Promise<Response> {
    try {
      if (!request.user?.id) {
        throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
      }

      const { jobId } = request.params;
      if (!jobId) {
        throw AppError.badRequest('Job ID is required', 'MISSING_JOB_ID');
      }

      const force = request.query.force === 'true';
      const queue = getConformityCheckerQueue();
      await queue.removeJob(jobId, force);

      return response.status(204).send();
    } catch (error) {
      if (error instanceof AppError) {
        return response.status(error.statusCode).json({
          status: 'error',
          message: error.message,
          code: error.code,
        });
      }
      if (error instanceof Error && error.message.includes('not found')) {
        return response.status(404).json({
          status: 'error',
          message: 'Job not found',
          code: 'JOB_NOT_FOUND',
        });
      }
      console.error('Error deleting job:', error);
      return response.status(500).json({ status: 'error', message: 'Failed to delete job' });
    }
  }
}
