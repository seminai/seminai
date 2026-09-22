import { createFileRoute } from '@tanstack/react-router';
import { RegisterPage } from '@/components/organisms/register-page';

export const Route = createFileRoute('/_auth/register')({
  validateSearch: (search: Record<string, unknown>): { invite?: string } => ({
    invite: typeof search.invite === 'string' ? search.invite : undefined,
  }),
  component: RegisterRoute,
});

function RegisterRoute() {
  const { invite } = Route.useSearch();
  return <RegisterPage initialInviteCode={invite} />;
}
