import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import type { SetupDraft } from '@/components/organisms/setup-draft';
import type { SetupLlmProvider } from '@/lib/setup-api';

const PROVIDERS: readonly SetupLlmProvider[] = ['ollama', 'openrouter', 'openai', 'anthropic', 'openai-compatible'];

interface SetupWizardFieldsProps {
  readonly step: 'admin' | 'llm' | 'access' | 'email' | 'review';
  readonly draft: SetupDraft;
  readonly onChange: (draft: SetupDraft) => void;
  readonly ollamaReachable: boolean | null;
  readonly ollamaModels: readonly string[];
}

export function SetupWizardFields({
  step,
  draft,
  onChange,
  ollamaReachable,
  ollamaModels,
}: SetupWizardFieldsProps): JSX.Element {
  const { t } = useTranslation();
  const patch = (partial: Partial<SetupDraft>) => onChange({ ...draft, ...partial });

  if (step === 'admin') {
    return (
      <div className="flex flex-col gap-3">
        <Field id="setup-name" label={t('setup.adminName')} value={draft.name} onChange={(name) => patch({ name })} />
        <Field id="setup-email" label={t('common.email')} type="email" value={draft.email} onChange={(email) => patch({ email })} />
        <Field id="setup-password" label={t('common.password')} type="password" value={draft.password} onChange={(password) => patch({ password })} />
      </div>
    );
  }

  if (step === 'llm') {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          {ollamaReachable ? t('setup.ollamaReady') : t('setup.ollamaMissing')}
        </p>
        <div className="flex flex-wrap gap-2">
          {PROVIDERS.map((provider) => (
            <Button
              key={provider}
              type="button"
              variant={draft.provider === provider ? 'default' : 'outline'}
              onClick={() => patch({ provider })}
            >
              {t(`setup.providers.${provider}`)}
            </Button>
          ))}
        </div>
        <Field id="setup-model" label={t('setup.model')} value={draft.model} onChange={(model) => patch({ model })} />
        {draft.provider === 'ollama' || draft.provider === 'openai-compatible' ? (
          <Field id="setup-base-url" label={t('setup.baseUrl')} value={draft.baseUrl} onChange={(baseUrl) => patch({ baseUrl })} />
        ) : (
          <Field id="setup-api-key" label={t('setup.apiKey')} type="password" value={draft.apiKey} onChange={(apiKey) => patch({ apiKey })} />
        )}
        {ollamaModels.length > 0 && draft.provider === 'ollama' && (
          <p className="text-xs text-muted-foreground">{ollamaModels.join(', ')}</p>
        )}
      </div>
    );
  }

  if (step === 'access') {
    return (
      <div className="flex flex-col gap-3">
        <Button type="button" variant={draft.accessMode === 'lan' ? 'default' : 'outline'} onClick={() => patch({ accessMode: 'lan' })}>
          {t('setup.accessLan')}
        </Button>
        <Button type="button" variant={draft.accessMode === 'public' ? 'default' : 'outline'} onClick={() => patch({ accessMode: 'public' })}>
          {t('setup.accessPublic')}
        </Button>
      </div>
    );
  }

  if (step === 'email') {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{t('setup.emailOptional')}</p>
        <Field id="setup-smtp" label={t('setup.smtpHost')} value={draft.smtpHost} onChange={(smtpHost) => patch({ smtpHost })} />
        <Field id="setup-smtp-user" label={t('setup.smtpUser')} value={draft.smtpUser} onChange={(smtpUser) => patch({ smtpUser })} />
        <Field id="setup-smtp-password" label={t('common.password')} type="password" value={draft.smtpPassword} onChange={(smtpPassword) => patch({ smtpPassword })} />
      </div>
    );
  }

  return (
    <dl className="grid grid-cols-2 gap-2 text-sm">
      <dt className="text-muted-foreground">{t('setup.adminName')}</dt>
      <dd>{draft.name}</dd>
      <dt className="text-muted-foreground">{t('common.email')}</dt>
      <dd>{draft.email}</dd>
      <dt className="text-muted-foreground">{t('setup.provider')}</dt>
      <dd>{t(`setup.providers.${draft.provider}`)}</dd>
      <dt className="text-muted-foreground">{t('setup.model')}</dt>
      <dd>{draft.model}</dd>
      <dt className="text-muted-foreground">{t('setup.access')}</dt>
      <dd>{draft.accessMode === 'lan' ? t('setup.accessLan') : t('setup.accessPublic')}</dd>
    </dl>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = 'text',
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly type?: string;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
