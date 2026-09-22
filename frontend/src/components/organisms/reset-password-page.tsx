import { useMemo } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod/v4';
import { usePostAuthResetPassword } from '@/generated/api/auth/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api-client';

interface ResetPasswordPageProps {
  readonly token?: string;
}

function createResetPasswordSchema(t: TFunction) {
  return z
    .object({
      newPassword: z.string().min(6, t('auth.errors.minPassword')),
      confirmPassword: z.string(),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: t('auth.errors.passwordMismatch'),
      path: ['confirmPassword'],
    });
}

function getResetPasswordErrorMessage(error: ApiError, t: TFunction): string {
  if (error.body.code === 'INVALID_TOKEN' || error.body.code === 'INVALID_TOKEN_TYPE') {
    return t('auth.resetPassword.invalidToken');
  }
  if (error.body.code === 'PASSWORD_MISMATCH') {
    return t('auth.errors.passwordMismatch');
  }
  if (error.body.code === 'PASSWORD_TOO_SHORT') {
    return t('auth.errors.minPassword');
  }
  return error.body.message ?? t('auth.resetPassword.error');
}

type ResetPasswordForm = z.infer<ReturnType<typeof createResetPasswordSchema>>;

export function ResetPasswordPage({ token }: ResetPasswordPageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const resetPassword = usePostAuthResetPassword<ApiError>();
  const resetPasswordSchema = useMemo(() => createResetPasswordSchema(t), [t]);
  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordSchema),
  });
  const onSubmit = async (data: ResetPasswordForm) => {
    if (!token) {
      setError('root', { message: t('auth.resetPassword.invalidLink') });
      return;
    }
    try {
      await resetPassword.mutateAsync({
        data: {
          token,
          newPassword: data.newPassword,
          confirmPassword: data.confirmPassword,
        },
      });
      await navigate({ to: '/login', search: { reset: 'success' } });
    } catch (err) {
      const message =
        err instanceof ApiError ? getResetPasswordErrorMessage(err, t) : t('auth.resetPassword.error');
      setError('root', { message });
    }
  };

  if (!token) {
    return (
      <div className="flex flex-col gap-4 text-center">
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {t('auth.resetPassword.invalidLink')}
        </div>
        <Link to="/auth/forgot-password" className="text-sm font-medium text-primary underline">
          {t('auth.actions.requestNewResetLink')}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 text-center">
        <h1 className="text-xl font-semibold">{t('auth.resetPassword.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('auth.resetPassword.description')}</p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="newPassword">{t('auth.fields.newPassword')}</Label>
        <Input
          id="newPassword"
          type="password"
          placeholder={t('auth.placeholders.password')}
          {...register('newPassword')}
        />
        {errors.newPassword && <p className="text-sm text-destructive">{errors.newPassword.message}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="confirmPassword">{t('auth.fields.confirmPassword')}</Label>
        <Input
          id="confirmPassword"
          type="password"
          placeholder={t('auth.placeholders.password')}
          {...register('confirmPassword')}
        />
        {errors.confirmPassword && (
          <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
        )}
      </div>

      {errors.root && <p className="text-sm text-destructive">{errors.root.message}</p>}

      <Button type="submit" className="w-full" disabled={resetPassword.isPending}>
        {resetPassword.isPending ? t('auth.resetPassword.pending') : t('auth.resetPassword.submit')}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        <Link to="/login" className="font-medium text-primary underline">
          {t('auth.actions.backToLogin')}
        </Link>
      </p>
    </form>
  );
}
