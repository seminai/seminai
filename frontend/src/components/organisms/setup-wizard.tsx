import { useEffect, useMemo, useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { LanguageSwitcher } from '@/components/molecules/language-switcher';
import { ApiError } from '@/lib/api-client';
import { completeSetup, detectOllama } from '@/lib/setup-api';
import { SetupWizardFields } from '@/components/organisms/setup-wizard-fields';
import { authQueryOptions } from '@/hooks/use-auth';
import { INITIAL_SETUP_DRAFT, type SetupDraft } from '@/components/organisms/setup-draft';

const STEPS = ['admin', 'llm', 'access', 'email', 'review'] as const;
type SetupStep = (typeof STEPS)[number];

export function SetupWizard() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState<SetupDraft>(INITIAL_SETUP_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [ollamaReachable, setOllamaReachable] = useState<boolean | null>(null);
  const [ollamaModels, setOllamaModels] = useState<readonly string[]>([]);
  const step: SetupStep = STEPS[stepIndex];

  useEffect(() => {
    void detectOllama()
      .then((result) => {
        setOllamaReachable(result.reachable);
        setOllamaModels(result.models.map((model) => model.name));
        const firstModel = result.models[0];
        if (result.reachable && firstModel && draft.model === INITIAL_SETUP_DRAFT.model) {
          setDraft((current) => ({ ...current, model: firstModel.name, baseUrl: result.baseUrl }));
        }
      })
      .catch(() => setOllamaReachable(false));
    // Probe once on mount so the LLM step can show local models.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canContinue = useMemo(() => {
    if (step === 'admin') return draft.name.trim().length > 0 && draft.email.includes('@') && draft.password.length >= 8;
    if (step === 'llm') return draft.provider === 'ollama' || draft.apiKey.trim().length > 0;
    return true;
  }, [draft, step]);

  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      await completeSetup({
        admin: { name: draft.name.trim(), email: draft.email.trim(), password: draft.password },
        llm: {
          provider: draft.provider,
          baseUrl: draft.baseUrl,
          model: draft.model,
          apiKey: draft.apiKey || undefined,
        },
        access: { mode: draft.accessMode },
        email:
          draft.smtpHost || draft.smtpUser
            ? { smtpHost: draft.smtpHost, user: draft.smtpUser, password: draft.smtpPassword }
            : undefined,
      });
      await queryClient.invalidateQueries({ queryKey: authQueryOptions.queryKey });
      await router.invalidate();
      await router.navigate({ to: '/' });
    } catch (err) {
      setError(err instanceof ApiError ? err.body.message ?? t('setup.failed') : t('setup.failed'));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-14 items-center justify-between border-b px-4">
        <span className="text-sm font-semibold">{t('common.appName')}</span>
        <LanguageSwitcher />
      </header>
      <main className="flex flex-1 items-center justify-center p-4">
        <Card className="w-full max-w-lg p-8">
          <h1 className="mb-1 text-2xl font-bold">{t('setup.title')}</h1>
          <p className="mb-6 text-sm text-muted-foreground">{t(`setup.steps.${step}`)}</p>
          <SetupWizardFields
            step={step}
            draft={draft}
            onChange={setDraft}
            ollamaReachable={ollamaReachable}
            ollamaModels={ollamaModels}
          />
          {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
          <div className="mt-6 flex justify-between gap-2">
            <Button type="button" variant="outline" disabled={stepIndex === 0 || pending} onClick={() => setStepIndex((i) => i - 1)}>
              {t('common.back')}
            </Button>
            {step === 'review' ? (
              <Button type="button" disabled={pending} onClick={() => void submit()}>
                {pending ? t('common.loading') : t('setup.finish')}
              </Button>
            ) : (
              <Button type="button" disabled={!canContinue} onClick={() => setStepIndex((i) => i + 1)}>
                {t('common.next')}
              </Button>
            )}
          </div>
        </Card>
      </main>
    </div>
  );
}
