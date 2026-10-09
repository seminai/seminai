import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useCompanies } from '@/hooks/use-company-options';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
interface TunnelState {
  configured: boolean;
  running: boolean;
  ready: boolean;
  tunnelId: string;
  message: string;
}
export function SettingsTunnelPanel() {
  const desktop = window.seminaiDesktop;
  const { companies } = useCompanies();
  const [company, setCompany] = useState('');
  const [tunnelId, setTunnelId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const status = useQuery({
    queryKey: ['desktop-tunnel'],
    enabled: Boolean(desktop),
    queryFn: async () => (await desktop!.invoke('tunnel-state')) as TunnelState,
    refetchInterval: 5000,
  });
  const save = useMutation({
    mutationFn: (enabled: boolean) =>
      desktop!.invoke('tunnel-save', {
        enabled,
        tunnelId,
        apiKey,
        companyId: company || companies[0]?.id,
      }),
    onSuccess: () => {
      setApiKey('');
      void status.refetch();
    },
  });
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <h3 className="font-semibold">ChatGPT · Secure MCP Tunnel</h3>
      <ol className="list-decimal space-y-2 pl-5 text-sm">
        <li>
          Crea un tunnel nelle{' '}
          <a
            className="text-primary underline"
            href="https://platform.openai.com/settings/organization/tunnels"
            target="_blank"
            rel="noreferrer"
          >
            impostazioni OpenAI
          </a>{' '}
          con permessi Read + Manage.
        </li>
        <li>
          Associa il workspace ChatGPT e una credenziale runtime con permessi Read + Use.
          L’abbonamento ChatGPT da solo non configura il tunnel.
        </li>
        <li>
          Inserisci qui ID, credenziale e azienda. Il client incluso avvia il collegamento HTTPS in
          uscita.
        </li>
        <li>
          In ChatGPT aggiungi un server MCP personalizzato, scegli Tunnel e questo ID. Il
          collegamento usa l’azienda autorizzata qui; le operazioni richiedono conferma in Seminai.
        </li>
      </ol>
      {desktop ? (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(true);
          }}
        >
          <label className="block text-sm">
            ID tunnel
            <Input
              required
              value={tunnelId}
              onChange={(event) => setTunnelId(event.target.value)}
              placeholder={status.data?.tunnelId || 'tunnel_…'}
            />
          </label>
          <label className="block text-sm">
            Credenziale runtime OpenAI
            <Input
              type="password"
              autoComplete="off"
              required
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={
                status.data?.configured
                  ? 'Già configurata · reinserisci per modificare'
                  : 'Chiave con permessi tunnel'
              }
            />
          </label>
          <label className="block text-sm">
            Azienda autorizzata
            <select
              className="h-10 w-full rounded-md border bg-background px-3"
              value={company || companies[0]?.id || ''}
              onChange={(event) => setCompany(event.target.value)}
            >
              {companies.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button disabled={save.isPending || !companies.length}>Salva e avvia tunnel</Button>
            <Button
              type="button"
              variant="outline"
              disabled={save.isPending || !status.data?.configured}
              onClick={() => save.mutate(false)}
            >
              Disconnetti
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-sm">
          Apri queste impostazioni nell’app desktop per configurare il client del tunnel.
        </p>
      )}
      {status.data && (
        <p role="status" className="text-sm">
          {status.data.ready ? '● ' : '○ '}
          {status.data.message}
        </p>
      )}
      {(save.error || status.error) && (
        <p role="alert" className="text-sm text-destructive">
          {(save.error || status.error)?.message}
        </p>
      )}
      <a
        className="text-sm text-primary underline"
        href="https://developers.openai.com/api/docs/guides/secure-mcp-tunnels"
        target="_blank"
        rel="noreferrer"
      >
        Permessi e risoluzione dei problemi OpenAI
      </a>
    </section>
  );
}
