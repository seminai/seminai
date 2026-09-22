import { Request, Response } from 'express';
import { runFlows, InputDosageAgent } from '../../services/agents/dosage_agent';
import { getDosageAgentQueue } from '../../queue/DosageAgentQueue';
import { StartDosageAgentJobUseCase } from '../../../application/use-cases/job/StartDosageAgentJobUseCase';
import { GetDosageAgentJobStatusUseCase } from '../../../application/use-cases/job/GetDosageAgentJobStatusUseCase';
import { ListDosageAgentJobsUseCase } from '../../../application/use-cases/dosage-agent-jobs/ListDosageAgentJobsUseCase';
import { GetDosageAgentJobUseCase } from '../../../application/use-cases/dosage-agent-jobs/GetDosageAgentJobUseCase';
import { DeleteDosageAgentJobUseCase } from '../../../application/use-cases/dosage-agent-jobs/DeleteDosageAgentJobUseCase';
import { PrismaDosageAgentJobRepository } from '../../repositories/PrismaDosageAgentJobRepository';
import { prisma } from '../../repositories/Prisma';
import { AppError } from '../../../domain/errors/AppError';

const LLM_SYNC_TIMEOUT_MS = 120_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(AppError.internal(`${label} timed out after ${ms}ms`, 'LLM_TIMEOUT')),
      ms,
    );
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}

export class DosageAgentController {
  private startJobUseCase: StartDosageAgentJobUseCase | null = null;
  private getJobStatusUseCase: GetDosageAgentJobStatusUseCase | null = null;
  private listJobsUseCase: ListDosageAgentJobsUseCase | null = null;
  private getJobUseCase: GetDosageAgentJobUseCase | null = null;
  private deleteJobUseCase: DeleteDosageAgentJobUseCase | null = null;

  constructor() {}

  private initializeUseCases(): void {
    if (this.startJobUseCase && this.getJobStatusUseCase) {
      return;
    }
    const queue = getDosageAgentQueue();
    const dosageAgentJobRepository = new PrismaDosageAgentJobRepository(prisma);
    this.startJobUseCase = new StartDosageAgentJobUseCase(queue, dosageAgentJobRepository);
    this.getJobStatusUseCase = new GetDosageAgentJobStatusUseCase(queue, dosageAgentJobRepository);
    this.listJobsUseCase = new ListDosageAgentJobsUseCase(dosageAgentJobRepository);
    this.getJobUseCase = new GetDosageAgentJobUseCase(dosageAgentJobRepository);
    this.deleteJobUseCase = new DeleteDosageAgentJobUseCase(dosageAgentJobRepository);
  }

  private resolveUseCases(): {
    readonly startJobUseCase: StartDosageAgentJobUseCase;
    readonly getJobStatusUseCase: GetDosageAgentJobStatusUseCase;
    readonly listJobsUseCase: ListDosageAgentJobsUseCase;
    readonly getJobUseCase: GetDosageAgentJobUseCase;
    readonly deleteJobUseCase: DeleteDosageAgentJobUseCase;
  } {
    try {
      this.initializeUseCases();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'queue not available';
      throw AppError.internal(`Dosage queue unavailable: ${message}`, 'QUEUE_UNAVAILABLE');
    }
    if (
      !this.startJobUseCase ||
      !this.getJobStatusUseCase ||
      !this.listJobsUseCase ||
      !this.getJobUseCase ||
      !this.deleteJobUseCase
    ) {
      throw AppError.internal('Dosage queue use-cases are not initialized', 'QUEUE_UNAVAILABLE');
    }
    return {
      startJobUseCase: this.startJobUseCase,
      getJobStatusUseCase: this.getJobStatusUseCase,
      listJobsUseCase: this.listJobsUseCase,
      getJobUseCase: this.getJobUseCase,
      deleteJobUseCase: this.deleteJobUseCase,
    };
  }

  private parseOptionalDate(value: unknown, fieldName: string): Date | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }
    const date = value instanceof Date ? value : new Date(value as string);
    if (Number.isNaN(date.getTime())) {
      throw AppError.badRequest(`${fieldName} must be a valid ISO date`, 'INVALID_DATE');
    }
    return date;
  }

  private validatePlanningWindow(startAt?: Date, endAt?: Date): void {
    if (startAt && endAt && startAt.getTime() > endAt.getTime()) {
      throw AppError.badRequest('startAt must be <= endAt', 'INVALID_PLANNING_WINDOW');
    }
  }

  // Endpoint sincrono per esecuzione immediata (legacy — deprecato, usare /start-job)
  public async run(request: Request, response: Response): Promise<Response> {
    const body = request.body as Partial<InputDosageAgent>;
    const products = Array.isArray(body?.products) ? body.products : [];
    const unitOfProduction = Array.isArray(body?.unitOfProduction) ? body.unitOfProduction : [];
    const startAt = this.parseOptionalDate(body?.startAt, 'startAt');
    const endAt = this.parseOptionalDate(body?.endAt, 'endAt');
    this.validatePlanningWindow(startAt, endAt);
    const outcome = await withTimeout(
      runFlows({
        products,
        unitOfProduction,
        strategy: body?.strategy,
        startAt,
        endAt,
        outStockLimiter: body?.outStockLimiter ?? false,
      } as InputDosageAgent),
      LLM_SYNC_TIMEOUT_MS,
      'dosage-agent/run',
    );
    return response.json({ status: 'success', data: outcome });
  }

  // Endpoint sincrono per esecuzione immediata (legacy — deprecato, usare /start-job)
  public async plan(request: Request, response: Response): Promise<Response> {
    const body = request.body as Partial<InputDosageAgent>;
    const products = Array.isArray(body?.products) ? body.products : [];
    const unitOfProduction = Array.isArray(body?.unitOfProduction) ? body.unitOfProduction : [];
    const startAt = this.parseOptionalDate(body?.startAt, 'startAt');
    const endAt = this.parseOptionalDate(body?.endAt, 'endAt');
    this.validatePlanningWindow(startAt, endAt);
    const outcome = await withTimeout(
      runFlows({
        products,
        unitOfProduction,
        strategy: body?.strategy,
        startAt,
        endAt,
        outStockLimiter: body?.outStockLimiter ?? false,
      } as InputDosageAgent),
      LLM_SYNC_TIMEOUT_MS,
      'dosage-agent/plan',
    );
    return response.json({ status: 'success', data: outcome });
  }

  // Endpoint asincrono per avviare un job
  public async startJob(request: Request, response: Response): Promise<Response> {
    try {
      if (!request.user?.id) {
        throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
      }
      const body = request.body as Partial<InputDosageAgent>;
      const products = Array.isArray(body?.products) ? body.products : [];
      const unitOfProduction = Array.isArray(body?.unitOfProduction) ? body.unitOfProduction : [];
      const startAt = this.parseOptionalDate(body?.startAt, 'startAt');
      const endAt = this.parseOptionalDate(body?.endAt, 'endAt');
      this.validatePlanningWindow(startAt, endAt);
      const { startJobUseCase } = this.resolveUseCases();
      const result = await startJobUseCase.execute({
        input: {
          products,
          unitOfProduction,
          strategy: body?.strategy,
          outStockLimiter: body?.outStockLimiter ?? false,
          orchestrator: body?.orchestrator,
          startAt,
          endAt,
          operationMachines: Array.isArray(body?.operationMachines)
            ? body.operationMachines
            : undefined,
          operationOperators: Array.isArray(body?.operationOperators)
            ? body.operationOperators
            : undefined,
        } as InputDosageAgent,
        userId: request.user.id,
      });
      return response.json({
        status: 'success',
        data: {
          jobId: result.jobId,
          message: 'Job started successfully. Use /job-status endpoint to check progress.',
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
      console.error('Error starting dosage agent job:', error);
      return response.status(500).json({ status: 'error', message: 'Failed to start job' });
    }
  }

  // Endpoint per ottenere lo status di un job
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

  // Endpoint per elencare i job di un utente
  public async listJobs(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const limitParam = typeof request.query.limit === 'string' ? request.query.limit : undefined;
    const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
    const limit = parsedLimit && parsedLimit > 0 ? Math.min(parsedLimit, 200) : undefined;
    const { listJobsUseCase } = this.resolveUseCases();
    const jobs = await listJobsUseCase.execute({ userId: request.user.id, limit });
    return response.json({ status: 'success', data: jobs });
  }

  // Endpoint per ottenere un job salvato
  public async getStoredJob(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const { jobId } = request.params;
    if (!jobId) {
      throw AppError.badRequest('Job ID is required', 'MISSING_JOB_ID');
    }
    const { getJobUseCase } = this.resolveUseCases();
    const job = await getJobUseCase.execute({ jobId, userId: request.user.id });
    return response.json({ status: 'success', data: job });
  }

  // Endpoint per cancellare un job salvato
  public async deleteJob(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const { jobId } = request.params;
    if (!jobId) {
      throw AppError.badRequest('Job ID is required', 'MISSING_JOB_ID');
    }
    const { deleteJobUseCase } = this.resolveUseCases();
    await deleteJobUseCase.execute({ jobId, userId: request.user.id });
    return response.status(204).send();
  }
}
