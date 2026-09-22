import { createFileRoute } from '@tanstack/react-router';
import { RegisterPage } from '@/components/organisms/register-page';

export const Route = createFileRoute('/_auth/register')({
  component: RegisterPage,
});
