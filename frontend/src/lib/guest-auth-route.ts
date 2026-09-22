import { redirect } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { ensureAuthLoaded } from '@/hooks/use-auth';

export async function ensureGuestAuthRoute(queryClient: QueryClient): Promise<void> {
  const user = await ensureAuthLoaded(queryClient);
  if (user) {
    throw redirect({ to: '/' });
  }
}
