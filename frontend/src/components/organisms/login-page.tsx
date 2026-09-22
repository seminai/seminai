import { useMemo } from 'react';
import { Link, useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod/v4';
import { useAuth } from '@/hooks/use-auth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api-client';

function createLoginSchema(t: TFunction) {
  return z.object({
    email: z.email(t('auth.errors.invalidEmail')),
    password: z.string().min(6, t('auth.errors.minPassword')),
  });
}

type LoginForm = z.infer<ReturnType<typeof createLoginSchema>>;

interface LoginPageProps {
  readonly isPasswordResetSuccess?: boolean;
}

export function LoginPage({ isPasswordResetSuccess = false }: LoginPageProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { login } = useAuth();
  const loginSchema = useMemo(() => createLoginSchema(t), [t]);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    try {
      await login.mutateAsync(data);
      await router.invalidate();
      await router.navigate({ to: '/' });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.body.message ?? t('auth.errors.invalidCredentials')
          : t('auth.errors.loginFailed');
      setError('root', { message });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">{t('common.email')}</Label>
        <Input id="email" type="email" placeholder={t('auth.placeholders.email')} {...register('email')} />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{t('common.password')}</Label>
        <Input id="password" type="password" placeholder={t('auth.placeholders.password')} {...register('password')} />
        {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
        <Link to="/auth/forgot-password" className="self-end text-sm font-medium text-primary underline">
          {t('auth.actions.forgotPassword')}
        </Link>
      </div>

      {isPasswordResetSuccess && (
        <div className="rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground">
          {t('auth.resetPassword.success')}
        </div>
      )}

      {errors.root && (
        <p className="text-sm text-destructive">{errors.root.message}</p>
      )}

      <Button type="submit" className="w-full" disabled={login.isPending}>
        {login.isPending ? t('auth.loginPending') : t('auth.actions.login')}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {t('auth.registerCta')}{' '}
        <Link to="/register" className="font-medium text-primary underline">
          {t('auth.actions.register')}
        </Link>
      </p>
    </form>
  );
}
