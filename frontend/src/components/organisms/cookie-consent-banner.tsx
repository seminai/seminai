import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useConsent } from '@/hooks/use-consent';

const COOKIE_POLICY_URL = import.meta.env.VITE_COOKIE_POLICY_URL;

/**
 * GDPR cookie-consent banner. Shown (over every route) until the user makes a
 * choice; "Accept" enables PostHog, "Necessary only" keeps it disabled. Both
 * choices are remembered. Can be reopened from settings to withdraw consent.
 */
export function CookieConsentBanner() {
  const { t } = useTranslation();
  const { isBannerVisible, accept, reject } = useConsent();

  if (!isBannerVisible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 p-4 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium">{t('consent.title')}</p>
          <p className="text-sm text-muted-foreground">
            {t('consent.description')}
            {COOKIE_POLICY_URL ? (
              <>
                {' '}
                <a
                  href={COOKIE_POLICY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium underline underline-offset-2"
                >
                  {t('consent.policyLink')}
                </a>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={reject}>
            {t('consent.reject')}
          </Button>
          <Button size="sm" onClick={accept}>
            {t('consent.accept')}
          </Button>
        </div>
      </div>
    </div>
  );
}
