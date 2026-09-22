export const DEFAULT_LANGUAGE = 'it';
export const LANGUAGE_STORAGE_KEY = 'seminai-language';

export const SUPPORTED_LANGUAGES = [
  { code: 'it', shortLabel: 'IT', labelKey: 'common.languages.it' },
  { code: 'en', shortLabel: 'ENG', labelKey: 'common.languages.en' },
] as const;

export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number]['code'];

const SUPPORTED_LANGUAGE_CODES = new Set<AppLanguage>(
  SUPPORTED_LANGUAGES.map((language) => language.code),
);

export function normalizeLanguage(language?: string | null): AppLanguage {
  const code = language?.toLowerCase().split('-')[0];
  return code && SUPPORTED_LANGUAGE_CODES.has(code as AppLanguage)
    ? (code as AppLanguage)
    : DEFAULT_LANGUAGE;
}

export function readStoredLanguage(): AppLanguage {
  if (typeof window === 'undefined') return DEFAULT_LANGUAGE;
  return normalizeLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
}

export function storeLanguage(language: AppLanguage): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
}
