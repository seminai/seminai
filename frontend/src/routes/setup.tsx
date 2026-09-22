import { createFileRoute } from '@tanstack/react-router';
import { SetupWizard } from '@/components/organisms/setup-wizard';
import { ensureSetupPending } from '@/lib/setup-guard';
import { RoutePending } from '@/components/atoms/route-pending';

export const Route = createFileRoute('/setup')({
  beforeLoad: () => ensureSetupPending(),
  pendingComponent: RoutePending,
  pendingMs: 0,
  component: SetupWizard,
});
