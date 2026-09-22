import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  getGetSettingsEmailInboundQueryKey,
  getGetSettingsWhatsappAllowlistQueryKey,
  getGetSettingsWhatsappStatusQueryKey,
  useDeleteSettingsWhatsappAllowlistPhoneNumber,
  useGetSettingsEmailInbound,
  useGetSettingsWhatsappAllowlist,
  useGetSettingsWhatsappQrCode,
  useGetSettingsWhatsappStatus,
  usePatchSettingsEmailInbound,
  usePostSettingsWhatsappAllowlist,
  usePostSettingsWhatsappDisconnect,
  usePostSettingsWhatsappSetup,
} from '@/generated/api/settings/settings';
import { Button } from '@/components/ui/button';
import {
  Copy,
  Loader2,
  Plus,
  RefreshCw,
  X,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import telegramQrCode from '@/assets/integration/telegram_qrcode.png';
import { Switch } from '@/components/ui/switch';

/* ─── WhatsApp ─── */

export function WhatsAppPanel() {
  const queryClient = useQueryClient();
  const [newNumber, setNewNumber] = useState('');

  const statusQuery = useGetSettingsWhatsappStatus();
  const allowlistQuery = useGetSettingsWhatsappAllowlist();
  const setupMutation = usePostSettingsWhatsappSetup();
  const disconnectMutation = usePostSettingsWhatsappDisconnect();
  const addNumberMutation = usePostSettingsWhatsappAllowlist();
  const removeNumberMutation = useDeleteSettingsWhatsappAllowlistPhoneNumber();

  const statusPayload = statusQuery.data?.data?.data as {
    configured?: boolean;
    connected?: boolean;
    status?: string;
    phoneNumber?: string | null;
  } | undefined;

  const allowedNumbers = (allowlistQuery.data?.data?.data as { allowedNumbers?: string[] } | undefined)
    ?.allowedNumbers ?? [];

  const shouldLoadQr = useMemo(() => {
    const s = statusPayload?.status;
    return s === 'connecting' || s === 'qr_code_ready';
  }, [statusPayload?.status]);

  const qrQuery = useGetSettingsWhatsappQrCode({ query: { enabled: shouldLoadQr, retry: false } });
  const qrBase64 = (qrQuery.data?.data?.data as { qrCodeBase64?: string } | undefined)?.qrCodeBase64;

  const invalidateWhatsapp = () => {
    queryClient.invalidateQueries({ queryKey: getGetSettingsWhatsappStatusQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetSettingsWhatsappAllowlistQueryKey() });
  };

  const handleConnect = () => setupMutation.mutate({ data: {} }, { onSuccess: invalidateWhatsapp });
  const handleDisconnect = () =>
    disconnectMutation.mutate({ data: { deleteInstance: false } }, { onSuccess: invalidateWhatsapp });

  const handleAddNumber = () => {
    if (!newNumber.trim()) return;
    addNumberMutation.mutate(
      { data: { phoneNumber: newNumber.trim() } },
      { onSuccess: () => { invalidateWhatsapp(); setNewNumber(''); } },
    );
  };

  const handleRemoveNumber = (num: string) => {
    removeNumberMutation.mutate({ phoneNumber: num }, { onSuccess: invalidateWhatsapp });
  };

  if (statusQuery.isLoading) return <p className="text-sm text-muted-foreground">Caricamento...</p>;

  return (
    <div className="space-y-4">
      {/* Warning */}
      <div className="rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm dark:border-yellow-700 dark:bg-yellow-950/30">
        <p className="font-medium text-yellow-800 dark:text-yellow-400">
          Importante: Numero WhatsApp dedicato richiesto
        </p>
        <p className="mt-1 text-yellow-700 dark:text-yellow-500">
          Il numero WhatsApp utilizzato per questa integrazione{' '}
          <strong>DEVE essere diverso</strong> dal tuo numero personale. Se
          colleghi il tuo numero personale, l&apos;integrazione smetterà di
          funzionare correttamente.
        </p>
      </div>

      {/* Status */}
      <div className="flex items-center justify-between rounded-md border p-3">
        <div>
          <p className="text-sm font-medium">
            {statusPayload?.connected ? 'WhatsApp connesso' : 'WhatsApp non connesso'}
          </p>
          {statusPayload?.phoneNumber && (
            <p className="text-xs text-muted-foreground">{statusPayload.phoneNumber}</p>
          )}
          {!statusPayload?.connected && (
            <p className="text-xs text-muted-foreground">
              Collega WhatsApp per inviare note di campo tramite messaggi
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" onClick={invalidateWhatsapp}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          {statusPayload?.connected ? (
            <Button variant="destructive" size="sm" onClick={handleDisconnect} disabled={disconnectMutation.isPending}>
              Disconnetti
            </Button>
          ) : (
            <Button size="sm" onClick={handleConnect} disabled={setupMutation.isPending}>
              {setupMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Collega WhatsApp
            </Button>
          )}
        </div>
      </div>

      {/* QR Code */}
      {shouldLoadQr && (
        <div className="flex justify-center rounded-md border p-4">
          {qrQuery.isLoading && <p className="text-sm text-muted-foreground">Caricamento QR Code...</p>}
          {qrQuery.isError && (
            <p className="text-sm text-muted-foreground">
              QR Code non disponibile. Prova a cliccare &quot;Collega WhatsApp&quot;.
            </p>
          )}
          {qrBase64 && <img src={qrBase64} alt="WhatsApp QR Code" className="max-h-64 rounded-md" />}
        </div>
      )}

      {/* Allowlist */}
      <div className="space-y-3 rounded-md border p-3">
        <p className="text-sm font-medium">Numeri autorizzati a inviare messaggi</p>
        <div className="rounded-md border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-400">
          Se la lista è vuota, tutti i numeri possono inviare messaggi. Aggiungendo uno o più numeri, solo quelli
          elencati saranno autorizzati.
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="+393331234567"
            value={newNumber}
            onChange={(e) => setNewNumber(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddNumber())}
          />
          <Button variant="outline" size="sm" onClick={handleAddNumber} disabled={addNumberMutation.isPending}>
            <Plus className="h-4 w-4" /> Aggiungi
          </Button>
        </div>
        {allowedNumbers.length === 0 ? (
          <p className="text-xs italic text-muted-foreground">
            Nessun numero in lista — tutti i numeri sono ammessi.
          </p>
        ) : (
          <ul className="space-y-1">
            {allowedNumbers.map((num) => (
              <li key={num} className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm">
                {num}
                <button type="button" onClick={() => handleRemoveNumber(num)} className="text-muted-foreground hover:text-destructive">
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ─── Telegram ─── */

export function TelegramPanel() {
  return (
    <div className="flex flex-col items-center gap-3 py-4">
      <p className="text-sm text-muted-foreground">
        Scansiona il QR Code per collegare il bot Telegram <strong>@SEMINAIBOT</strong>
      </p>
      <img src={telegramQrCode} alt="Telegram QR Code @SEMINAIBOT" className="max-h-72 rounded-lg" />
    </div>
  );
}

/* ─── Email Inbound ─── */

export function EmailPanel() {
  const queryClient = useQueryClient();
  const statusQuery = useGetSettingsEmailInbound();
  const patchMutation = usePatchSettingsEmailInbound();
  const enabled = statusQuery.data?.data?.data?.enabled ?? false;
  const inboxAddress =
    statusQuery.data?.data?.data?.inboxAddress ?? 'inbox@inbox.seminai.app';

  const handleToggle = (next: boolean) => {
    patchMutation.mutate(
      { data: { enabled: next } },
      {
        onSuccess: () =>
          queryClient.invalidateQueries({ queryKey: getGetSettingsEmailInboundQueryKey() }),
      },
    );
  };

  const handleCopy = () => {
    void navigator.clipboard.writeText(inboxAddress);
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
          <p className="text-sm font-medium">Ricevi documenti via email</p>
          <p className="text-xs text-muted-foreground">
            Quando attivo, le email inviate dal tuo indirizzo a Seminai vengono elaborate dall'AI.
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={patchMutation.isPending}
        />
      </div>

      <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
        <p className="text-xs font-medium text-muted-foreground">Invia documenti a:</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded bg-background px-2 py-1.5 text-xs">
            {inboxAddress}
          </code>
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopy}
            aria-label="Copia indirizzo email"
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Allega PDF, immagini, CSV o Excel. Riceverai una risposta con il link per confermare le
          azioni proposte dall'AI.
        </p>
      </div>

      {patchMutation.isError && (
        <p className="text-xs text-destructive">
          Impossibile aggiornare l'impostazione. Riprova.
        </p>
      )}
    </div>
  );
}
