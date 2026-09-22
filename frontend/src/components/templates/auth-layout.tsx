import { Outlet } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { LanguageSwitcher } from '@/components/molecules/language-switcher';

export function AuthLayout() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
        <span className="text-sm font-semibold">{t('common.appName')}</span>
        <LanguageSwitcher />
      </header>
      <main className="flex flex-1 items-center justify-center p-4">
        <Card className="w-full max-w-md p-8">
          <div className="mb-6 flex flex-col items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{t('common.appName')}</h1>
          </div>
          <Outlet />
        </Card>
      </main>
    </div>
  );
}
