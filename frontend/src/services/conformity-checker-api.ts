import { customFetch } from '@/lib/api-client';
import type {
  ConfirmConformityProposalsRequest,
  ConfirmConformityProposalsResponse,
  StartConformityCheckJobRequest,
  StartConformityCheckJobResponse,
} from '@/types/conformity-checker';

export function startConformityCheckJob(
  input: StartConformityCheckJobRequest,
): Promise<StartConformityCheckJobResponse> {
  return customFetch<StartConformityCheckJobResponse>({
    url: '/conformity-checker/start-job',
    method: 'POST',
    data: input,
  });
}

export function confirmConformityProposals(
  input: ConfirmConformityProposalsRequest,
): Promise<ConfirmConformityProposalsResponse> {
  return customFetch<ConfirmConformityProposalsResponse>({
    url: '/conformity-checker/confirm',
    method: 'POST',
    data: input,
  });
}
