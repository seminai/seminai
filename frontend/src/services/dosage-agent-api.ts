import { customFetch } from '@/lib/api-client';
import type {
  StartDosageJobRequest,
  StartDosageJobResponse,
  DosageJobStatusResponse,
  DosageJobListResponse,
} from '@/types/planning';

export function startDosageAgentJob(
  input: StartDosageJobRequest,
): Promise<StartDosageJobResponse> {
  return customFetch<StartDosageJobResponse>({
    url: '/dosage-agent/start-job',
    method: 'POST',
    data: input,
  });
}

export function getDosageAgentJobStatus(
  jobId: string,
): Promise<DosageJobStatusResponse> {
  return customFetch<DosageJobStatusResponse>({
    url: `/dosage-agent/job-status/${encodeURIComponent(jobId)}`,
    method: 'GET',
  });
}

export function listDosageAgentJobs(): Promise<DosageJobListResponse> {
  return customFetch<DosageJobListResponse>({
    url: '/dosage-agent/jobs',
    method: 'GET',
  });
}
