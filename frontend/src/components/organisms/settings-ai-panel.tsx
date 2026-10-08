import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { farmRequest } from '@/services/farm-api';
interface AiSettings {
  visionModel: string;
  audioModel: string;
  embeddingModel: string;
  restartRequired?: boolean;
  enabled: boolean;
  provider: string;
  model: string;
  baseUrl: string;
  hasApiKey: boolean;
  capabilities: { vision: boolean; audio: boolean; embeddings: boolean };
}
export function SettingsAiPanel() {
  const query = useQuery({
    queryKey: ['settings', 'ai'],
    queryFn: () => farmRequest<AiSettings>('/ai-settings'),
  });
  if (query.isLoading) return <p role="status">Caricamento configurazione…</p>;
  if (query.error) return <p role="alert">{query.error.message}</p>;
  return query.data ? <AiForm key={query.dataUpdatedAt} initial={query.data} /> : null;
}
function AiForm({ initial }: { initial: AiSettings }) {
  const cache = useQueryClient();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [provider, setProvider] = useState(initial.provider);
  const [model, setModel] = useState(initial.model);
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl);
  const [apiKey, setApiKey] = useState<string | undefined>();
  const [models, setModels] = useState({
    visionModel: initial.visionModel,
    audioModel: initial.audioModel,
    embeddingModel: initial.embeddingModel,
  });
  const [capabilities, setCapabilities] = useState(initial.capabilities);
  const save = useMutation({
    mutationFn: () =>
      farmRequest<AiSettings>('/ai-settings', 'PUT', {
        enabled,
        provider,
        model,
        baseUrl,
        apiKey,
        ...capabilities,
        ...models,
      }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['settings', 'ai'] });
      void cache.invalidateQueries({ queryKey: ['public-runtime-config'] });
    },
  });
  const test = useMutation({
    mutationFn: () =>
      farmRequest<{ reachable: boolean; message: string }>('/ai-settings/test', 'POST'),
  });
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <p className="text-sm text-muted-foreground">
        Quaderno e magazzino funzionano anche senza AI. Puoi usare un modello locale o una tua
        chiave API. I collegamenti a Claude e ChatGPT sono separati.
      </p>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        Abilita intelligenza artificiale
      </label>
      <label className="block space-y-1 text-sm">
        Provider
        <select
          className="h-10 w-full rounded-md border bg-background px-3"
          value={provider}
          onChange={(event) => {
            setProvider(event.target.value);
            setApiKey('');
            setBaseUrl(event.target.value === 'ollama' ? 'http://127.0.0.1:11434' : '');
            setModel('');
            setModels({ visionModel: '', audioModel: '', embeddingModel: '' });
            setCapabilities({ vision: false, audio: false, embeddings: false });
          }}
        >
          {[
            ['ollama', 'Ollama · locale'],
            ['openai', 'OpenAI'],
            ['anthropic', 'Anthropic'],
            ['openrouter', 'OpenRouter'],
            ['openai-compatible', 'Compatibile OpenAI'],
          ].map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {['ollama', 'openai-compatible'].includes(provider) && (
        <label className="block space-y-1 text-sm">
          Endpoint
          <Input
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder="http://127.0.0.1:11434"
          />
        </label>
      )}
      {provider !== 'ollama' && (
        <label className="block space-y-1 text-sm">
          Chiave API personale
          <Input
            type="password"
            autoComplete="off"
            value={apiKey ?? ''}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={
              initial.hasApiKey && provider === initial.provider && apiKey === undefined
                ? 'Credenziale già configurata'
                : 'Inserisci credenziale'
            }
          />
        </label>
      )}
      <label className="block space-y-1 text-sm">
        Modello chat
        <Input
          value={model}
          onChange={(event) => setModel(event.target.value)}
          placeholder="Identificativo del modello"
        />
      </label>
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">
          Capacità aggiuntive del provider configurato
        </legend>
        {(
          [
            ['vision', 'Immagini'],
            ['audio', 'Audio'],
            ['embeddings', 'Embeddings'],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={capabilities[key]}
              onChange={(event) =>
                setCapabilities({ ...capabilities, [key]: event.target.checked })
              }
            />
            {label}
          </label>
        ))}
      </fieldset>
      {(['visionModel', 'audioModel', 'embeddingModel'] as const).map((key) => (
        <label className="block text-sm" key={key}>
          {key === 'visionModel'
            ? 'Modello immagini'
            : key === 'audioModel'
              ? 'Modello audio'
              : 'Modello embeddings'}
          <Input
            value={models[key]}
            onChange={(event) => setModels({ ...models, [key]: event.target.value })}
          />
        </label>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button disabled={save.isPending} type="submit">
          {save.isPending ? 'Salvataggio…' : 'Salva configurazione'}
        </Button>
        <Button
          variant="outline"
          type="button"
          disabled={test.isPending || save.isPending}
          onClick={() => test.mutate()}
        >
          Verifica collegamento salvato
        </Button>
      </div>
      {save.isSuccess && save.data.restartRequired && (
        <p role="status" className="text-sm">
          Configurazione salvata.{' '}
          {window.seminaiDesktop
            ? 'Il servizio locale si riavvia per applicare il modello. Attendi qualche secondo.'
            : 'Riavvia il servizio Seminai per applicare il nuovo modello ai servizi già attivi.'}
        </p>
      )}
      {(save.error || test.error) && (
        <p role="alert" className="text-sm text-destructive">
          {(save.error || test.error)?.message}
        </p>
      )}
      {test.data && <p role="status">{test.data.message}</p>}
    </form>
  );
}
