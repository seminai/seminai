import { customFetch } from '@/lib/api-client';

export interface AccessStatus {
  readonly accessMode: string;
  readonly publicBaseUrl: string;
  readonly inviteRequired: boolean;
  readonly inviteCode: string;
  readonly inviteUrl: string;
  readonly qrDataUrl: string;
  readonly tunnel: {
    readonly provider: string;
    readonly configured: boolean;
    readonly healthy: boolean;
    readonly publicUrl: string | null;
  };
}

interface Envelope<T> {
  readonly status: string;
  readonly data: T;
}

export async function fetchAccessStatus(): Promise<AccessStatus> {
  const body = await customFetch<Envelope<AccessStatus>>({
    url: '/access/status',
    method: 'GET',
  });
  return body.data;
}

export async function rotateAccessInvite(): Promise<AccessStatus> {
  const body = await customFetch<Envelope<AccessStatus>>({
    url: '/access/invite',
    method: 'POST',
  });
  return body.data;
}
