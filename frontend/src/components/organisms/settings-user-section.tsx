import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { Camera, Eye, EyeOff, Loader2, Save, User } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetUsersMeQueryKey,
  useGetUsersMe,
  usePatchUsersMe,
  usePostUsersMeProfilePicture,
} from '@/generated/api/users/users';
import { usePutAuthUpdatePassword } from '@/generated/api/auth/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { SettingsPreferencesCard } from './settings-preferences-card';

interface ProfileFormValues {
  readonly name: string;
  readonly surname: string;
  readonly companyName: string;
  readonly vatNumber: string;
  readonly phoneNumber: string;
  readonly address: string;
}

interface PasswordFormValues {
  readonly oldPassword: string;
  readonly newPassword: string;
  readonly confirmPassword: string;
}

export function SettingsUserSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showOldPwd, setShowOldPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);

  const userQuery = useGetUsersMe();
  const patchUser = usePatchUsersMe();
  const uploadPicture = usePostUsersMeProfilePicture();
  const updatePassword = usePutAuthUpdatePassword();

  const userData = userQuery.data?.data?.data;
  const user = userData?.user as Record<string, string | null | undefined> | undefined;

  const profileForm = useForm<ProfileFormValues>({
    values: {
      name: (user?.name as string) ?? '',
      surname: (user?.surname as string) ?? '',
      companyName: (user?.companyName as string) ?? '',
      vatNumber: (user?.vatNumber as string) ?? '',
      phoneNumber: (user?.phoneNumber as string) ?? '',
      address: (user?.address as string) ?? '',
    },
  });

  const passwordForm = useForm<PasswordFormValues>({
    defaultValues: { oldPassword: '', newPassword: '', confirmPassword: '' },
  });

  const invalidateUser = () => queryClient.invalidateQueries({ queryKey: getGetUsersMeQueryKey() });

  const onSaveProfile = profileForm.handleSubmit((data) => {
    patchUser.mutate({ data }, { onSuccess: invalidateUser });
  });

  const onChangePassword = passwordForm.handleSubmit((data) => {
    if (data.newPassword !== data.confirmPassword) return;
    updatePassword.mutate(
      { data: { oldPassword: data.oldPassword, newPassword: data.newPassword, confirmPassword: data.confirmPassword } },
      { onSuccess: () => passwordForm.reset() },
    );
  });

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadPicture.mutate({ data: { file } }, { onSuccess: invalidateUser });
  };

  if (userQuery.isLoading) return <SectionState label={t('settings.user.loading')} />;
  if (userQuery.isError) return <SectionState label={t('settings.user.loadError')} />;
  if (!user) return <SectionState label={t('settings.user.noData')} />;

  const profilePictureUrl = user.profilePictureUrl as string | undefined;

  return (
    <div className="space-y-6 p-5">
      <h2 className="text-lg font-semibold">{t('settings.user.profile')}</h2>

      {/* Avatar */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted"
        >
          {profilePictureUrl ? (
            <img src={profilePictureUrl} alt="Avatar" className="h-full w-full object-cover" />
          ) : (
            <User className="h-8 w-8 text-muted-foreground" />
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity hover:opacity-100">
            <Camera className="h-5 w-5 text-white" />
          </span>
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
        <div className="text-sm text-muted-foreground">
          {t('settings.user.avatarHint')}
          {uploadPicture.isPending && <span className="ml-2">{t('settings.user.uploading')}</span>}
        </div>
      </div>

      {/* Profile form */}
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.user.personalInfo')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSaveProfile} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label={t('settings.user.fields.name')} {...profileForm.register('name')} />
              <FormField label={t('settings.user.fields.surname')} {...profileForm.register('surname')} />
              <div className="space-y-1.5">
                <Label>{t('common.email')}</Label>
                <Input value={(user.email as string) ?? ''} disabled />
              </div>
              <FormField label={t('settings.user.fields.companyName')} {...profileForm.register('companyName')} />
              <FormField label={t('settings.user.fields.vatNumber')} {...profileForm.register('vatNumber')} />
              <FormField label={t('settings.user.fields.phoneNumber')} {...profileForm.register('phoneNumber')} />
              <div className="space-y-1.5 md:col-span-2">
                <Label>{t('settings.user.fields.address')}</Label>
                <Input {...profileForm.register('address')} />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={patchUser.isPending || !profileForm.formState.isDirty}>
                {patchUser.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {t('settings.user.save')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Separator />

      {/* Visualization preferences */}
      <SettingsPreferencesCard />

      <Separator />

      {/* Password change */}
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.user.changePassword')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onChangePassword} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t('settings.user.currentPassword')}</Label>
                <div className="relative">
                  <Input
                    type={showOldPwd ? 'text' : 'password'}
                    {...passwordForm.register('oldPassword', { required: true })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowOldPwd(!showOldPwd)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showOldPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div />
              <div className="space-y-1.5">
                <Label>{t('settings.user.newPassword')}</Label>
                <div className="relative">
                  <Input
                    type={showNewPwd ? 'text' : 'password'}
                    {...passwordForm.register('newPassword', { required: true, minLength: 6 })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPwd(!showNewPwd)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showNewPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t('settings.user.confirmPassword')}</Label>
                <Input
                  type="password"
                  {...passwordForm.register('confirmPassword', { required: true, minLength: 6 })}
                />
              </div>
            </div>
            {passwordForm.watch('newPassword') !== passwordForm.watch('confirmPassword') &&
              passwordForm.formState.dirtyFields.confirmPassword && (
                <p className="text-sm text-destructive">{t('settings.user.passwordMismatch')}</p>
              )}
            <div className="flex justify-end">
              <Button type="submit" disabled={updatePassword.isPending || !passwordForm.formState.isDirty}>
                {updatePassword.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t('settings.user.changePassword')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function FormField({
  label,
  ...inputProps
}: { readonly label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input {...inputProps} />
    </div>
  );
}

function SectionState({ label }: { readonly label: string }) {
  return (
    <div className="flex min-h-[220px] items-center justify-center p-5 text-sm text-muted-foreground">
      {label}
    </div>
  );
}
