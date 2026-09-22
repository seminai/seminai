import { createFileRoute } from '@tanstack/react-router';
import { LoginPage } from '@/components/organisms/login-page';

interface LoginSearch {
  readonly reset?: 'success';
}

export const Route = createFileRoute('/_auth/login')({
  component: LoginRoute,
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    reset: search.reset === 'success' ? 'success' : undefined,
  }),
});

// eslint-disable-next-line react-refresh/only-export-components -- route file keeps its page component inline
function LoginRoute() {
  const { reset } = Route.useSearch();
  return <LoginPage isPasswordResetSuccess={reset === 'success'} />;
}
