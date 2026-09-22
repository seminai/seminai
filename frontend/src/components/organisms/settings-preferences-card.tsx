import { Loader2, TableProperties } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { LanguageSwitcher } from '@/components/molecules/language-switcher';
import { useConsent } from '@/hooks/use-consent';
import { useTablesViewMode } from '@/hooks/use-tables-view-mode';
import { useUpdateUserSettings } from '@/hooks/use-user-settings';
import { changeAppLanguage } from '@/i18n/config';
import { normalizeLanguage, type AppLanguage } from '@/i18n/languages';

/**
 * User-level visualization preferences card. Currently exposes the "Excel
 * view" toggle that switches all generic data tables (and the extraction
 * review tables) to the AG Grid-based spreadsheet experience.
 *
 * The preference is persisted in the Settings model on the backend, so it is
 * synced across browsers/devices for the same user.
 */
export function SettingsPreferencesCard() {
  const { i18n, t } = useTranslation();
  const { mode, setMode, isLoading, isUpdating } = useTablesViewMode();
  const updateSettings = useUpdateUserSettings();
  const { reopen: reopenConsent } = useConsent();
  const [languageSaveError, setLanguageSaveError] = useState(false);
  const isExcel = mode === 'excel';

  async function handleLanguageChange(language: AppLanguage) {
    const previousLanguage = normalizeLanguage(i18n.resolvedLanguage ?? i18n.language);
    setLanguageSaveError(false);
    await changeAppLanguage(language);
    try {
      await updateSettings.mutateAsync({ language });
    } catch {
      setLanguageSaveError(true);
      await changeAppLanguage(previousLanguage);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TableProperties className="h-5 w-5" />
          {t('settings.preferences.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label>{t('settings.preferences.language.title')}</Label>
            <p className="text-sm text-muted-foreground">
              {t('settings.preferences.language.description')}
            </p>
            {languageSaveError && (
              <p className="text-sm text-destructive">
                {t('settings.preferences.language.saveError')}
              </p>
            )}
          </div>
          <div className="flex min-w-20 items-center justify-end gap-2">
            {updateSettings.isPending ? (
              <Loader2
                className="h-4 w-4 animate-spin text-muted-foreground"
                aria-label={t('settings.preferences.language.saving')}
              />
            ) : null}
            <LanguageSwitcher
              disabled={updateSettings.isPending}
              onChange={(language) => {
                void handleLanguageChange(language);
              }}
            />
          </div>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label>{t('settings.preferences.display.title')}</Label>
            <p className="text-sm text-muted-foreground">
              {t('settings.preferences.display.description')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isUpdating ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : null}
            <Switch
              checked={isExcel}
              disabled={isLoading || isUpdating}
              onCheckedChange={(checked) => setMode(checked ? 'excel' : 'grid')}
            />
          </div>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label>{t('consent.manageTitle')}</Label>
            <p className="text-sm text-muted-foreground">
              {t('consent.manageDescription')}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={reopenConsent}>
            {t('consent.manage')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Label({ children }: { readonly children: React.ReactNode }) {
  return <p className="text-sm font-medium leading-none">{children}</p>;
}
