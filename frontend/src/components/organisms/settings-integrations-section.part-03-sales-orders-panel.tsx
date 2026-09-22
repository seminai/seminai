import {
  getGetSettingsOpenMeteoQueryKey,
  useGetSettingsEmailInbound,
  useGetSettingsOpenMeteo,
  usePatchSettingsOpenMeteo,
} from '@/generated/api/settings/settings';
import { orderTemplateUrl } from '@/hooks/use-sales';
import { Button } from '@/components/ui/button';
import {
  Copy,
  Download,
  Loader2,
  Trash2,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Switch } from '@/components/ui/switch';
import {
  getGetUsersMeQueryKey,
  useGetUsersMe,
  usePatchUsersMe,
} from '@/generated/api/users/users';
import { useState } from 'react';
import { Input } from '@/components/ui/input';

/* ─── Sales order template (agent orders) ─── */

export function SalesOrdersPanel() {
  const statusQuery = useGetSettingsEmailInbound();
  const inboxAddress =
    statusQuery.data?.data?.data?.inboxAddress ?? 'inbox@inbox.seminai.app';

  const handleDownload = () => {
    window.open(orderTemplateUrl(), '_blank', 'noopener,noreferrer');
  };

  const handleCopyInbox = () => {
    void navigator.clipboard.writeText(inboxAddress);
  };

  return (
    <div className="space-y-4 py-2">
      <p className="text-xs text-muted-foreground">
        Dai ai tuoi agenti un modello Excel con colonne fisse. Caricalo in chat o invialo via email:
        l'AI legge l'ordine, abbina cliente e prodotti e crea una bozza dopo la tua conferma.
      </p>

      <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
        <p className="text-xs font-medium text-muted-foreground">Modello ordine (.xlsx)</p>
        <Button size="sm" variant="outline" onClick={handleDownload}>
          <Download className="mr-2 h-3.5 w-3.5" /> Scarica il modello
        </Button>
      </div>

      <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
        <p className="text-xs font-medium text-muted-foreground">Invia il modello compilato a:</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded bg-background px-2 py-1.5 text-xs">
            {inboxAddress}
          </code>
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopyInbox}
            aria-label="Copia indirizzo email"
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="space-y-1 rounded-lg border bg-muted/40 p-3 opacity-60">
        <p className="text-xs font-medium text-muted-foreground">Link ordine pubblico</p>
        <p className="text-xs text-muted-foreground">
          Presto disponibile — gli agenti potranno compilare l'ordine da una pagina web.
        </p>
      </div>
    </div>
  );
}

/* ─── Open-Meteo (weather forecast) ─── */

export function OpenMeteoPanel() {
  const queryClient = useQueryClient();
  const statusQuery = useGetSettingsOpenMeteo();
  const patchMutation = usePatchSettingsOpenMeteo();
  const enabled = statusQuery.data?.data?.data?.enabled ?? false;

  const handleToggle = (next: boolean) => {
    patchMutation.mutate(
      { data: { enabled: next } },
      {
        onSuccess: () =>
          queryClient.invalidateQueries({ queryKey: getGetSettingsOpenMeteoQueryKey() }),
      },
    );
  };

  if (statusQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Caricamento...
      </div>
    );
  }

  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">Previsioni meteo per i trattamenti</p>
          <p className="text-xs text-muted-foreground">
            Quando attivo, l&apos;AI può consultare le previsioni Open-Meteo per suggerire la
            finestra di applicazione ottimale e segnalare rischi (pioggia, vento, gelate).
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={patchMutation.isPending}
        />
      </div>

      {patchMutation.isError && (
        <p className="text-xs text-destructive">
          Impossibile aggiornare l&apos;impostazione. Riprova.
        </p>
      )}
    </div>
  );
}

/* ─── API Key panels (QDC / iFarming) ─── */

export function ApiKeyPanel({ field }: { readonly field: 'qdcApiKey' | 'ifarmingApiKey' }) {
  const queryClient = useQueryClient();
  const userQuery = useGetUsersMe();
  const patchUser = usePatchUsersMe();
  const currentValue =
    (userQuery.data?.data?.data as Record<string, string | null | undefined> | undefined)?.[field] ?? '';
  const [value, setValue] = useState(currentValue as string);

  const handleSave = () => {
    patchUser.mutate(
      { data: { [field]: value || null } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetUsersMeQueryKey() }) },
    );
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {field === 'qdcApiKey'
          ? 'Inserisci la tua API Key QDC per abilitare l\'integrazione.'
          : 'Inserisci la tua API Key iFarming per abilitare l\'integrazione.'}
      </p>
      <div className="flex items-center gap-2">
        <Input
          placeholder="Inserisci API Key..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button size="sm" onClick={handleSave} disabled={patchUser.isPending || value === currentValue}>
          {patchUser.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Salva
        </Button>
        {currentValue && (
          <Button
            variant="destructive"
            size="icon-sm"
            onClick={() => {
              setValue('');
              patchUser.mutate(
                { data: { [field]: null } },
                { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetUsersMeQueryKey() }) },
              );
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

/* ─── Small icon components ─── */

export function QdcIcon() {
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full border border-yellow-600 text-[10px] font-bold text-yellow-700">
      Q
    </span>
  );
}

export function IFarmingIcon() {
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full border border-green-700 text-[10px] font-bold text-green-800">
      iF
    </span>
  );
}
