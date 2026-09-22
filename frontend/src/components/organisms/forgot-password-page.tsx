import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod/v4';
import { usePostAuthForgotPassword } from '@/generated/api/auth/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api-client';

function createForgotPasswordSchema(t: TFunction) {
  return z.object({
    email: z.email(t('auth.errors.invalidEmail')),
  });
}

type ForgotPasswordForm = z.infer<ReturnType<typeof createForgotPasswordSchema>>;

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const forgotPassword = usePostAuthForgotPassword<ApiError>();
  const [isSubmitted, setIsSubmitted] = useState(false);
  const forgotPasswordSchema = useMemo(() => createForgotPasswordSchema(t), [t]);
  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<ForgotPasswordForm>({
    resolver: zodResolver(forgotPasswordSchema),
  });
  const onSubmit = async (data: ForgotPasswordForm) => {
    try {
      await forgotPassword.mutateAsync({ data });
      setIsSubmitted(true);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.body.message ?? t('auth.forgotPassword.error')
          : t('auth.forgotPassword.error');
      setError('root', { message });
    }
  };

  if (isSubmitted) {
    return (
      <div className="flex flex-col gap-4 text-center">
        <div className="rounded-md border border-border bg-muted p-4 text-sm text-muted-foreground">
          {t('auth.forgotPassword.success')}
        </div>
        <Link to="/login" className="text-sm font-medium text-primary underline">
          {t('auth.actions.backToLogin')}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 text-center">
        <h1 className="text-xl font-semibold">{t('auth.forgotPassword.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('auth.forgotPassword.description')}</p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="forgot-email">{t('common.email')}</Label>
        <Input
          id="forgot-email"
          type="email"
          placeholder={t('auth.placeholders.email')}
          {...register('email')}
        />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>

      {errors.root && <p className="text-sm text-destructive">{errors.root.message}</p>}

      <Button type="submit" className="w-full" disabled={forgotPassword.isPending}>
        {forgotPassword.isPending
          ? t('auth.forgotPassword.pending')
          : t('auth.forgotPassword.submit')}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        <Link to="/login" className="font-medium text-primary underline">
          {t('auth.actions.backToLogin')}
        </Link>
      </p>
    </form>
  );
}
