import { SettingsTunnelPanel } from './settings-tunnel-panel';
import { SettingsMcpClientPanel } from './settings-mcp-client-panel';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { farmRequest } from '@/services/farm-api';
interface Connection {
  id: string;
  name: string;
  companyId: string;
  revokedAt: string | null;
}
export function SettingsMcpPanel() {
  const cache = useQueryClient();
  const [message, setMessage] = useState('');
  const connections = useQuery({
    queryKey: ['mcp-connections'],
    queryFn: () => farmRequest<Connection[]>('/farm/connections'),
  });
  const revoke = useMutation({
    mutationFn: (id: string) =>
      farmRequest(`/farm/connections/${encodeURIComponent(id)}`, 'DELETE'),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['mcp-connections'] });
    },
  });
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Gli assistenti possono leggere i dati dell’azienda autorizzata e proporre operazioni.
        Carichi, scarichi e attività vengono registrati solo dopo la tua conferma nel quaderno.
      </p>
      <section className="space-y-2 rounded-lg border p-4">
        <h3 className="font-semibold">Claude Desktop</h3>
        <p className="text-sm">
          Installa il connettore, apri Claude e autorizza l’azienda nella pagina Seminai che si
          apre. Non occorre copiare token.
        </p>
        <Button
          disabled={!window.seminaiDesktop}
          onClick={() => {
            void window.seminaiDesktop
              ?.invoke('claude')
              .catch((error: Error) => setMessage(error.message));
          }}
        >
          Installa in Claude
        </Button>
        {!window.seminaiDesktop && (
          <a
            className="block text-sm text-primary underline"
            href="https://github.com/seminai/seminai/releases"
            target="_blank"
            rel="noreferrer"
          >
            Scarica il pacchetto .mcpb dalla release
          </a>
        )}
      </section>
      <SettingsTunnelPanel />
      <SettingsMcpClientPanel />
      <section className="space-y-2">
        <h3 className="font-semibold">Connessioni autorizzate</h3>
        {connections.isLoading && <p role="status">Caricamento…</p>}
        {!connections.isLoading && !connections.data?.filter((item) => !item.revokedAt).length && (
          <p className="text-sm text-muted-foreground">Nessuna connessione attiva.</p>
        )}
        {connections.data
          ?.filter((item) => !item.revokedAt)
          .map((item) => (
            <div
              className="flex items-center justify-between gap-2 rounded-lg border p-3"
              key={item.id}
            >
              <div>
                <p>{item.name}</p>
                <p className="text-xs text-muted-foreground">Azienda {item.companyId}</p>
              </div>
              <Button
                variant="outline"
                disabled={revoke.isPending}
                onClick={() => revoke.mutate(item.id)}
              >
                Revoca
              </Button>
            </div>
          ))}
      </section>
      {(connections.error || revoke.error || message) && (
        <p role="alert" className="text-sm text-destructive">
          {connections.error?.message || revoke.error?.message || message}
        </p>
      )}
    </div>
  );
}
