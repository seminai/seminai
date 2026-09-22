import { createFileRoute } from '@tanstack/react-router';
import { ForgotPasswordPage } from '@/components/organisms/forgot-password-page';

export const Route = createFileRoute('/_auth/auth/forgot-password')({
  component: ForgotPasswordPage,
});
