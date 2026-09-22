import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '@/i18n/locales/en.json';
import it from '@/i18n/locales/it.json';
import { DEFAULT_LANGUAGE, normalizeLanguage, readStoredLanguage, storeLanguage } from '@/i18n/languages';

void i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      it: { translation: it },
    },
    lng: readStoredLanguage(),
    fallbackLng: DEFAULT_LANGUAGE,
    interpolation: {
      escapeValue: false,
    },
    returnNull: false,
  });

i18n.on('languageChanged', (language) => {
  storeLanguage(normalizeLanguage(language));
});

export async function changeAppLanguage(language: string): Promise<void> {
  await i18n.changeLanguage(normalizeLanguage(language));
}

export default i18n;
