import { getApiBaseUrl } from '@/lib/api-base-url';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
interface DesktopState {
  url: string;
  lan: boolean;
  addresses: string[];
  version?: string;
}
declare global {
  interface Window {
    seminaiDesktop?: { invoke: (action: string, value?: unknown) => Promise<unknown> };
  }
}
export function SettingsDesktopPanel() {
  const desktop = window.seminaiDesktop;
  const query = useQuery({
    queryKey: ['desktop'],
    enabled: Boolean(desktop),
    queryFn: async () => (await desktop!.invoke('state')) as DesktopState,
  });
  const action = useMutation({
    mutationFn: async ({ name, value }: { name: string; value?: unknown }) =>
      desktop!.invoke(name, value),
    onSettled: () => {
      void query.refetch();
    },
  });
  if (!desktop)
    return (
      <p className="text-sm text-muted-foreground">
        Le impostazioni del servizio locale sono disponibili nell’app desktop. Per accedere da
        questo dispositivo mantieni accesa l’istanza Seminai.
      </p>
    );
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Chiudere la finestra mantiene Seminai nell’area notifiche. Usa “Esci da Seminai” per
        arrestare i servizi. Telefono, tablet e MCP funzionano mentre l’istanza è accesa.
      </p>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          disabled={!query.data || action.isPending}
          checked={query.data?.lan ?? false}
          onChange={(event) => action.mutate({ name: 'lan', value: event.target.checked })}
        />
        Accedi da telefono o tablet
      </label>
      {query.data?.addresses.map((address) => (
        <div key={address} className="rounded-md border p-3">
          <a className="text-primary underline" href={address} target="_blank" rel="noreferrer">
            {address}
          </a>
          <img
            alt="QR per aprire Seminai dal telefono"
            className="mt-3 h-36 w-36"
            src={`${getApiBaseUrl()}/farm/desktop-qr?address=${encodeURIComponent(address)}`}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Stessa rete Wi-Fi · accedi con il tuo account Seminai.
          </p>
        </div>
      ))}
      <p className="text-sm">
        Il backup include database, allegati e chiavi per recuperare le impostazioni cifrate.
        Conservalo in un luogo privato. Il ripristino richiede lo stesso sistema operativo e
        architettura.
      </p>
      <div className="flex flex-wrap gap-2">
        {[
          ['backup', 'Crea backup'],
          ['restore', 'Ripristina backup'],
          ['export-portable', 'Esporta per un altro sistema'],
          ['import-portable', 'Importa dati Docker / altro sistema'],
          ['updates', 'Controlla aggiornamenti'],
        ].map(([name, label]) => (
          <Button
            key={name}
            variant="outline"
            disabled={action.isPending}
            onClick={() => action.mutate({ name })}
          >
            {label}
          </Button>
        ))}
      </div>
      {action.isPending && (
        <p role="status">Operazione in corso. Attendi il riavvio dei servizi…</p>
      )}
      {(action.error || query.error) && (
        <p role="alert" className="text-destructive">
          {(action.error || query.error)?.message}
        </p>
      )}
    </div>
  );
}
