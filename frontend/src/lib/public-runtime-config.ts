import { customFetch } from '@/lib/api-client';
import {
  EMPTY_PUBLIC_RUNTIME_CONFIG,
  type PublicRuntimeConfig,
} from '@/types/public-runtime-config';

interface Envelope<T> {
  readonly status: string;
  readonly data: T;
}

export async function fetchPublicRuntimeConfig(): Promise<PublicRuntimeConfig> {
  try {
    const body = await customFetch<Envelope<PublicRuntimeConfig>>({
      url: '/config/public',
      method: 'GET',
    });
    return body.data;
  } catch {
    return EMPTY_PUBLIC_RUNTIME_CONFIG;
  }
}

export async function fetchSetupStatus(): Promise<{ completed: boolean }> {
  try {
    const body = await customFetch<Envelope<{ completed: boolean }>>({
      url: '/setup/status',
      method: 'GET',
    });
    return body.data;
  } catch {
    return { completed: true };
  }
}
