import { useState } from 'react';
import {
  ChevronDown,
  CloudSun,
  FileSpreadsheet,
  Mail,
  MessageCircle,
  Send,
  Truck,
} from 'lucide-react';
import { CourierEmailSettings } from '@/components/organisms/courier-email-settings';
import { QdcSyncPanel } from '@/components/organisms/settings-qdc-panel';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { EmailPanel, TelegramPanel, WhatsAppPanel } from './settings-integrations-section.part-02-whats-app-panel';
import { ApiKeyPanel, IFarmingIcon, OpenMeteoPanel, QdcIcon, SalesOrdersPanel } from './settings-integrations-section.part-03-sales-orders-panel';

export type OpenPanel =
  | 'whatsapp'
  | 'telegram'
  | 'email'
  | 'sales-orders'
  | 'courier-email'
  | 'open-meteo'
  | 'qdc'
  | 'ifarming'
  | null;

export function SettingsIntegrationsSection() {
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);

  const toggle = (panel: OpenPanel) =>
    setOpenPanel((prev) => (prev === panel ? null : panel));

  return (
    <div className="space-y-4 p-5">
      <h2 className="text-lg font-semibold">Integrazioni</h2>

      <IntegrationToggle
        icon={<MessageCircle className="h-5 w-5 text-green-600" />}
        label="WhatsApp"
        isOpen={openPanel === 'whatsapp'}
        onToggle={() => toggle('whatsapp')}
      >
        <WhatsAppPanel />
      </IntegrationToggle>

      <IntegrationToggle
        icon={<Send className="h-5 w-5 text-blue-500" />}
        label="Telegram"
        isOpen={openPanel === 'telegram'}
        onToggle={() => toggle('telegram')}
      >
        <TelegramPanel />
      </IntegrationToggle>

      <IntegrationToggle
        icon={<Mail className="h-5 w-5 text-orange-500" />}
        label="Email"
        isOpen={openPanel === 'email'}
        onToggle={() => toggle('email')}
      >
        <EmailPanel />
      </IntegrationToggle>

      <IntegrationToggle
        icon={<FileSpreadsheet className="h-5 w-5 text-emerald-600" />}
        label="Ordini agenti"
        isOpen={openPanel === 'sales-orders'}
        onToggle={() => toggle('sales-orders')}
      >
        <SalesOrdersPanel />
      </IntegrationToggle>

      <IntegrationToggle
        icon={<Truck className="h-5 w-5 text-amber-600" />}
        label="Email corriere"
        isOpen={openPanel === 'courier-email'}
        onToggle={() => toggle('courier-email')}
      >
        <CourierEmailSettings />
      </IntegrationToggle>

      <IntegrationToggle
        icon={<CloudSun className="h-5 w-5 text-sky-500" />}
        label="Meteo (Open-Meteo)"
        isOpen={openPanel === 'open-meteo'}
        onToggle={() => toggle('open-meteo')}
      >
        <OpenMeteoPanel />
      </IntegrationToggle>

      <IntegrationToggle
        icon={<QdcIcon />}
        label="QDC — Quaderno di Campagna"
        isOpen={openPanel === 'qdc'}
        onToggle={() => toggle('qdc')}
      >
        <QdcSyncPanel />
        <ApiKeyPanel field="qdcApiKey" />
      </IntegrationToggle>

      <IntegrationToggle
        icon={<IFarmingIcon />}
        label="iFarming API Key"
        isOpen={openPanel === 'ifarming'}
        onToggle={() => toggle('ifarming')}
      >
        <ApiKeyPanel field="ifarmingApiKey" />
      </IntegrationToggle>
    </div>
  );
}

/* ─── Collapsible wrapper ─── */

export function IntegrationToggle({
  icon,
  label,
  isOpen,
  onToggle,
  children,
}: {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly isOpen: boolean;
  readonly onToggle: () => void;
  readonly children: React.ReactNode;
}) {
  return (
    <Card className={cn(isOpen && 'ring-2 ring-primary/30')}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        {icon}
        <span className="flex-1 text-sm font-medium">{label}</span>
        <ChevronDown
          className={cn('h-4 w-4 text-muted-foreground transition-transform', isOpen && 'rotate-180')}
        />
      </button>
      {isOpen && <CardContent className="pt-0">{children}</CardContent>}
    </Card>
  );
}
