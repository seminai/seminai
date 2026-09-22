import { useTranslation } from 'react-i18next';
import { changeAppLanguage } from '@/i18n/config';
import { SUPPORTED_LANGUAGES, normalizeLanguage, type AppLanguage } from '@/i18n/languages';
import { cn } from '@/lib/utils';

interface LanguageSwitcherProps {
  readonly className?: string;
  readonly disabled?: boolean;
  readonly onChange?: (language: AppLanguage) => void;
}

export function LanguageSwitcher({ className, disabled, onChange }: LanguageSwitcherProps) {
  const { i18n, t } = useTranslation();
  const activeLanguage = normalizeLanguage(i18n.resolvedLanguage ?? i18n.language);

  function handleChange(language: AppLanguage) {
    if (language === activeLanguage || disabled) return;
    if (onChange) {
      onChange(language);
      return;
    }
    void changeAppLanguage(language);
  }

  return (
    <div
      aria-label={t('common.language')}
      className={cn('inline-flex items-center gap-1 text-xs font-semibold', className)}
    >
      {SUPPORTED_LANGUAGES.map((language, index) => (
        <span key={language.code} className="inline-flex items-center gap-1">
          {index > 0 && <span className="text-muted-foreground">|</span>}
          <button
            type="button"
            disabled={disabled}
            aria-pressed={activeLanguage === language.code}
            title={t(language.labelKey)}
            className={cn(
              'rounded px-1.5 py-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              activeLanguage === language.code
                ? 'text-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
            onClick={() => handleChange(language.code)}
          >
            {language.shortLabel}
          </button>
        </span>
      ))}
    </div>
  );
}
