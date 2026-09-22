import { createFileRoute } from '@tanstack/react-router';
import { ResetPasswordPage } from '@/components/organisms/reset-password-page';

interface ResetPasswordSearch {
  readonly token?: string;
}

export const Route = createFileRoute('/_auth/auth/reset-password')({
  component: ResetPasswordRoute,
  validateSearch: (search: Record<string, unknown>): ResetPasswordSearch => ({
    token: typeof search.token === 'string' && search.token.trim().length > 0 ? search.token : undefined,
  }),
});

function ResetPasswordRoute() {
  const { token } = Route.useSearch();
  return <ResetPasswordPage token={token} />;
}
