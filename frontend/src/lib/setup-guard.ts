import { redirect } from '@tanstack/react-router';
import { fetchSetupStatus } from '@/lib/public-runtime-config';

export async function ensureSetupCompleted(): Promise<void> {
  const status = await fetchSetupStatus();
  if (!status.completed) {
    throw redirect({ to: '/setup' });
  }
}

export async function ensureSetupPending(): Promise<void> {
  const status = await fetchSetupStatus();
  if (status.completed) {
    throw redirect({ to: '/login' });
  }
}
