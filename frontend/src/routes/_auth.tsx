import { createFileRoute } from '@tanstack/react-router';
import { AuthLayout } from '@/components/templates/auth-layout';
import { RoutePending } from '@/components/atoms/route-pending';
import { ensureGuestAuthRoute } from '@/lib/guest-auth-route';

export const Route = createFileRoute('/_auth')({
  beforeLoad: async ({ context }) => ensureGuestAuthRoute(context.queryClient),
  pendingComponent: RoutePending,
  pendingMs: 0,
  component: AuthLayout,
});
