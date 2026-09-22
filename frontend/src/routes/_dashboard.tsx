import { createFileRoute, redirect } from '@tanstack/react-router';
import { DashboardLayout } from '@/components/templates/dashboard-layout';
import { RoutePending } from '@/components/atoms/route-pending';
import { ensureAuthLoaded } from '@/hooks/use-auth';

export const Route = createFileRoute('/_dashboard')({
  beforeLoad: async ({ context }) => {
    const user = await ensureAuthLoaded(context.queryClient);
    if (!user) {
      throw redirect({ to: '/login' });
    }
  },
  pendingComponent: RoutePending,
  pendingMs: 0,
  component: DashboardLayout,
});
