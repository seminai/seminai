import { useEffect } from 'react';
import { changeAppLanguage } from '@/i18n/config';
import { normalizeLanguage } from '@/i18n/languages';
import { useUserSettings } from '@/hooks/use-user-settings';

export function AuthenticatedLanguageSync() {
  const { data: settings } = useUserSettings();
  const settingsLanguage = settings?.language;

  useEffect(() => {
    if (!settingsLanguage) return;
    void changeAppLanguage(normalizeLanguage(settingsLanguage));
  }, [settingsLanguage]);

  return null;
}
