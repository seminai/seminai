/**
 * Pure helpers mapping a QDC sync run (status + counters) to display strings
 * for the integrations panel. Kept UI-free so it can be unit-tested.
 */

export interface QdcSyncStatusDescriptor {
  readonly label: string;
  readonly className: string;
}

export interface QdcSyncCountersView {
  readonly aziendeTotal?: number;
  readonly aziendeFailed?: number;
  readonly unitaUpserted?: number;
  readonly operazioniUpserted?: number;
  readonly giacenzeRows?: number;
  readonly scadenzeRows?: number;
}

const STATUS_DESCRIPTORS: Readonly<Record<string, QdcSyncStatusDescriptor>> = {
  running: { label: 'In corso…', className: 'bg-sky-100 text-sky-700' },
  success: { label: 'Completata', className: 'bg-emerald-100 text-emerald-700' },
  partial: { label: 'Parziale', className: 'bg-amber-100 text-amber-700' },
  error: { label: 'Errore', className: 'bg-red-100 text-red-700' },
};

const UNKNOWN_DESCRIPTOR: QdcSyncStatusDescriptor = {
  label: 'Sconosciuto',
  className: 'bg-muted text-muted-foreground',
};

export function describeQdcSyncStatus(status: string | null | undefined): QdcSyncStatusDescriptor {
  return (status && STATUS_DESCRIPTORS[status]) || UNKNOWN_DESCRIPTOR;
}

export function formatQdcSyncCounters(
  counters: QdcSyncCountersView | null | undefined,
): string | null {
  if (!counters) {
    return null;
  }
  const parts = [
    counters.aziendeTotal !== undefined ? `${counters.aziendeTotal} aziende` : null,
    counters.unitaUpserted !== undefined ? `${counters.unitaUpserted} unità` : null,
    counters.operazioniUpserted !== undefined ? `${counters.operazioniUpserted} operazioni` : null,
    counters.giacenzeRows !== undefined ? `${counters.giacenzeRows} giacenze` : null,
    counters.scadenzeRows !== undefined ? `${counters.scadenzeRows} scadenze` : null,
  ].filter(Boolean);
  const summary = parts.join(' · ');
  const failed =
    counters.aziendeFailed && counters.aziendeFailed > 0
      ? ` (${counters.aziendeFailed} aziende con errori)`
      : '';
  return summary.length > 0 ? `${summary}${failed}` : null;
}

export function formatQdcSyncDate(isoDate: string | null | undefined): string | null {
  if (!isoDate) {
    return null;
  }
  const parsed = new Date(isoDate);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toLocaleString('it-IT');
}
