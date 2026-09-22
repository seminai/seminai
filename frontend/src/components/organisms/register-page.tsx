import { useMemo, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod/v4';
import { useAuth } from '@/hooks/use-auth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { BookCallDialog } from '@/components/organisms/book-call-dialog';
import { ApiError } from '@/lib/api-client';

function createRegisterSchema(t: TFunction) {
  return z
    .object({
      name: z.string().min(1, t('auth.errors.nameRequired')),
      email: z.email(t('auth.errors.invalidEmail')),
      password: z.string().min(6, t('auth.errors.minPassword')),
      confirmPassword: z.string(),
      inviteCode: z.string().min(1, t('auth.errors.inviteCodeRequired')),
      fiscalCode: z.string().optional(),
      phoneNumber: z.string().optional(),
      address: z.string().optional(),
    })
    .refine((d) => d.password === d.confirmPassword, {
      message: t('auth.errors.passwordMismatch'),
      path: ['confirmPassword'],
    });
}

type RegisterForm = z.infer<ReturnType<typeof createRegisterSchema>>;

export function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { register: registerMutation } = useAuth();
  const [isInviteError, setIsInviteError] = useState(false);
  const [isBookCallOpen, setIsBookCallOpen] = useState(false);
  const registerSchema = useMemo(() => createRegisterSchema(t), [t]);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterForm) => {
    setIsInviteError(false);
    try {
      await registerMutation.mutateAsync({
        email: data.email,
        password: data.password,
        name: data.name,
        inviteCode: data.inviteCode,
        fiscalCode: data.fiscalCode?.trim() || undefined,
        phoneNumber: data.phoneNumber?.trim() || undefined,
        address: data.address?.trim() || undefined,
      });
      await navigate({ to: '/login' });
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body as { code?: string; message?: string };
        if (body.code === 'INVALID_INVITE_CODE') {
          setIsInviteError(true);
          setError('inviteCode', { message: t('auth.errors.invalidInviteCode') });
          return;
        }
        setError('root', { message: body.message ?? t('auth.errors.registrationFailed') });
      } else {
        setError('root', { message: t('auth.errors.registrationFailed') });
      }
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">{t('auth.fields.name')}</Label>
        <Input id="name" placeholder={t('auth.placeholders.name')} {...register('name')} />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">{t('common.email')}</Label>
        <Input id="email" type="email" placeholder={t('auth.placeholders.email')} {...register('email')} />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{t('common.password')}</Label>
        <Input id="password" type="password" placeholder={t('auth.placeholders.password')} {...register('password')} />
        {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
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

      <div className="flex flex-col gap-2">
        <Label htmlFor="fiscalCode">
          {t('auth.fields.fiscalCode')}{' '}
          <span className="text-muted-foreground">({t('common.optional')})</span>
        </Label>
        <Input id="fiscalCode" placeholder="RSSMRA80A01H501U" {...register('fiscalCode')} />
        {errors.fiscalCode && (
          <p className="text-sm text-destructive">{errors.fiscalCode.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="phoneNumber">
          {t('auth.fields.phoneNumber')}{' '}
          <span className="text-muted-foreground">({t('common.optional')})</span>
        </Label>
        <Input
          id="phoneNumber"
          type="tel"
          placeholder={t('auth.placeholders.phoneNumber')}
          {...register('phoneNumber')}
        />
        {errors.phoneNumber && (
          <p className="text-sm text-destructive">{errors.phoneNumber.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="address">
          {t('auth.fields.address')}{' '}
          <span className="text-muted-foreground">({t('common.optional')})</span>
        </Label>
        <Input id="address" placeholder={t('auth.placeholders.address')} {...register('address')} />
        {errors.address && <p className="text-sm text-destructive">{errors.address.message}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="inviteCode">{t('auth.fields.inviteCode')}</Label>
        <Input id="inviteCode" placeholder={t('auth.placeholders.inviteCode')} {...register('inviteCode')} />
        {errors.inviteCode && (
          <p className="text-sm text-destructive">{errors.inviteCode.message}</p>
        )}
      </div>

      {errors.root && <p className="text-sm text-destructive">{errors.root.message}</p>}

      <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
        {registerMutation.isPending ? t('auth.registerPending') : t('auth.actions.register')}
      </Button>

      {isInviteError && (
        <div className="rounded-md border border-border bg-muted p-4 text-center text-sm">
          <p className="mb-2 text-muted-foreground">
            {t('auth.inviteHelp')}
          </p>
          <Button variant="outline" size="sm" onClick={() => setIsBookCallOpen(true)}>
            {t('auth.bookCall.title')}
          </Button>
          <BookCallDialog open={isBookCallOpen} onOpenChange={setIsBookCallOpen} />
        </div>
      )}

      <p className="text-center text-sm text-muted-foreground">
        {t('auth.loginCta')}{' '}
        <Link to="/login" className="font-medium text-primary underline">
          {t('auth.actions.login')}
        </Link>
      </p>
    </form>
  );
}
