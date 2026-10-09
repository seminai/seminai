import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCompanies } from '@/hooks/use-company-options';
import { farmRequest } from '@/services/farm-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** A scoped token is shown once and stays in component memory only. */
export function SettingsMcpClientPanel() {
  const { companies } = useCompanies();
  const cache = useQueryClient();
  const [companyId, setCompanyId] = useState('');
  const [name, setName] = useState('Client MCP');
  const [endpoint, setEndpoint] = useState('');
  const [message, setMessage] = useState('');
  const desktop = useQuery({
    queryKey: ['desktop'],
    enabled: Boolean(window.seminaiDesktop),
    queryFn: async () => (await window.seminaiDesktop!.invoke('state')) as { mcpUrl: string },
  });
  const create = useMutation({
    mutationFn: () =>
      farmRequest<{ token: string }>('/farm/connections', 'POST', {
        name,
        companyId: companyId || companies[0]?.id,
      }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['mcp-connections'] });
    },
  });
  const url = endpoint || desktop.data?.mcpUrl || '';
  const configuration = JSON.stringify(
    {
      mcpServers: {
        seminai: {
          type: 'http',
          url,
          headers: { Authorization: `Bearer ${create.data?.token || '<credenziale dedicata>'}` },
        },
      },
    },
    null,
    2,
  );
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <h3 className="font-semibold">Altri client · Streamable HTTP</h3>
      <p className="text-sm">
        Autorizza un’azienda per il client. La credenziale consente lettura e proposte; puoi
        revocarla dall’elenco qui sotto. L’app deve restare accesa.
      </p>
      <label className="block text-sm">
        Nome client
        <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} />
      </label>
      <label className="block text-sm">
        Azienda
        <select
          className="h-10 w-full rounded-md border bg-background px-3"
          value={companyId || companies[0]?.id || ''}
          onChange={(event) => setCompanyId(event.target.value)}
        >
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        URL MCP
        <Input
          value={url}
          placeholder="https://mcp.esempio.it/mcp"
          onChange={(event) => setEndpoint(event.target.value)}
        />
      </label>
      <p className="text-xs text-muted-foreground">
        Per un’istanza HTTPS con OAuth, usa questo URL nel client e completa l’accesso e il consenso
        per l’azienda. Non occorre creare una credenziale manuale.
      </p>
      {!create.data && (
        <Button
          disabled={!companies.length || !name.trim() || !url || create.isPending}
          onClick={() => create.mutate()}
        >
          Autorizza client e genera configurazione
        </Button>
      )}
      {create.data && (
        <>
          <p className="text-sm">
            La credenziale viene mostrata una sola volta. Conserva la configurazione nel client.
          </p>
          <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">
            {configuration}
          </pre>
          <Button
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(configuration).then(
                () => setMessage('Configurazione copiata'),
                () => setMessage('Seleziona e copia il testo qui sopra.'),
              );
            }}
          >
            Copia configurazione
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              create.reset();
              setMessage('');
            }}
          >
            Nascondi credenziale
          </Button>
        </>
      )}
      {create.error && (
        <p role="alert" className="text-destructive">
          {create.error.message}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </section>
  );
}
