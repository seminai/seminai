import { useState, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  Upload,
  Plus,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FileTypeIcon } from '@/components/atoms/file-type-icon';
import { HomeChatSection } from '@/components/molecules/home-chat-section';
import { CommercialDeadlinesWidgets } from '@/components/molecules/commercial-deadlines-widgets';
import { CommercialInbox } from '@/components/organisms/commercial-inbox';
import { useTabs } from '@/hooks/use-tabs';
import { useWorkspace } from '@/hooks/use-workspace';
import { useArchiveRows } from '@/hooks/use-archive-rows';
import { useExpiringFiles, type ExpiringFile } from '@/hooks/use-expiring-files';
import { isManufacturingWorkspace } from '@/types/workspace';
import type { ExtractionArchiveRow } from '@/types/extraction';

const DISMISSED_KEY = 'seminai-home-dismissed-deadlines-v1';

function loadDismissed(): ReadonlySet<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveDismissed(ids: ReadonlySet<string>): void {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
  } catch {
    // silently ignore
  }
}

const QUICK_ACTIONS = [
  { id: 'upload', icon: Upload, labelKey: 'home.actions.upload' },
  { id: 'dosaggi', icon: Plus, labelKey: 'home.actions.createDosages' },
  { id: 'chat', icon: MessageSquare, labelKey: 'common.chat' },
] as const;

function formatTimeAgo(isoDate: string, t: TFunction): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return t('home.timeAgo.minutes', { count: Math.max(1, minutes) });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('home.timeAgo.hours', { count: hours });
  const days = Math.floor(hours / 24);
  return t('home.timeAgo.days', { count: days });
}

function formatDeadlineLabel(file: ExpiringFile, t: TFunction): string {
  const days = file.daysUntilExpiry;
  const suffix =
    days <= 0
      ? t('home.deadlines.expired')
      : days === 1
        ? t('home.deadlines.tomorrow')
        : t('home.deadlines.inDays', { count: days });
  return `${file.name} — ${file.companyName} (${suffix})`;
}

export function HomeView() {
  const { t } = useTranslation();
  const { addTab, setActiveView } = useTabs();
  const { activeWorkspaceKind } = useWorkspace();
  const isManufacturing = isManufacturingWorkspace(activeWorkspaceKind);
  const quickActions = useMemo(
    () => (isManufacturing ? QUICK_ACTIONS.filter((a) => a.id !== 'dosaggi') : QUICK_ACTIONS),
    [isManufacturing],
  );
  const [dismissedIds, setDismissedIds] = useState<ReadonlySet<string>>(loadDismissed);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { files: expiringFiles, isLoading: expiringLoading } = useExpiringFiles();

  const { rows } = useArchiveRows({
    page: 1,
    pageSize: 10,
    sortBy: 'updatedAt',
    sortOrder: 'desc',
    status: ['CONFIRMED'],
  });

  const recentFiles = useMemo(
    () => rows.filter((r): r is ExtractionArchiveRow => r.kind === 'extraction').slice(0, 6),
    [rows],
  );

  const handleQuickAction = useCallback(
    (id: string) => {
      switch (id) {
        case 'upload':
          addTab(
            { id: 'add-data', title: t('home.addData'), format: '-', source: 'archivio' },
            { to: '/add-data', search: { type: 'file' } },
          );
          break;
        case 'dosaggi':
          addTab(
            { id: 'add-data', title: t('home.addData'), format: '-', source: 'archivio' },
            { to: '/add-data', search: { type: 'plan' } },
          );
          break;
        case 'chat':
          setActiveView('chat');
          break;
      }
    },
    [addTab, setActiveView, t],
  );

  const toggleDismissed = useCallback((id: string) => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveDismissed(next);
      return next;
    });
  }, []);

  const handleFileClick = useCallback(
    (file: ExtractionArchiveRow) => {
      addTab({ id: file.id, title: file.titolo, format: file.formato, source: 'archivio' });
    },
    [addTab],
  );

  const scroll = useCallback((direction: 'left' | 'right') => {
    scrollRef.current?.scrollBy({
      left: direction === 'left' ? -260 : 260,
      behavior: 'smooth',
    });
  }, []);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 p-6">
      {/* Azioni rapide */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">{t('home.quickActions')}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {quickActions.map((action) => (
            <button
              key={action.id}
              type="button"
              className="flex flex-col items-start gap-4 rounded-xl border bg-card p-4 text-left text-sm font-medium transition-colors hover:bg-muted/60"
              onClick={() => handleQuickAction(action.id)}
            >
              <action.icon className="h-5 w-5 text-muted-foreground" />
              {t(action.labelKey)}
            </button>
          ))}
        </div>
      </section>

      {/* Chat */}
      <HomeChatSection />

      {/* Scadenze */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">{t('home.deadlines.title')}</h2>
        <Card size="sm">
          <div className="flex flex-col gap-1 px-4 py-3">
            {expiringLoading && (
              <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('home.deadlines.loading')}
              </div>
            )}
            {!expiringLoading && expiringFiles.length === 0 && (
              <p className="py-3 text-sm text-muted-foreground">
                {t('home.deadlines.empty')}
              </p>
            )}
            {expiringFiles.map((file) => {
              const isDismissed = dismissedIds.has(file.id);
              return (
                <button
                  key={file.id}
                  type="button"
                  className="flex items-center gap-3 rounded-lg px-2 py-2.5 text-left text-sm transition-colors hover:bg-muted/50"
                  onClick={() => toggleDismissed(file.id)}
                >
                  <Checkbox checked={isDismissed} />
                  <span className={isDismissed ? 'text-muted-foreground line-through' : ''}>
                    {formatDeadlineLabel(file, t)}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      </section>

      {/* Cosa fare oggi — commercial/agricultural; hidden for manufacturing workspaces */}
      {!isManufacturing && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            {t('home.commercial.title')}
          </h2>
          <div className="flex flex-col gap-3">
            <CommercialDeadlinesWidgets />
            <CommercialInbox />
          </div>
        </section>
      )}

      {/* Recenti */}
      {recentFiles.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">{t('home.recent')}</h2>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon-xs" onClick={() => scroll('left')}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon-xs" onClick={() => scroll('right')}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div
            ref={scrollRef}
            className="flex gap-3 overflow-x-auto scroll-smooth pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {recentFiles.map((file) => (
              <button
                key={file.id}
                type="button"
                className="flex w-52 shrink-0 flex-col gap-2 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/60"
                onClick={() => handleFileClick(file)}
              >
                <FileTypeIcon format={file.formato} className="h-6 w-6" />
                <span className="truncate text-sm font-medium">{file.titolo}</span>
                <span className="text-xs text-muted-foreground">
                  {formatTimeAgo(file.aggiornato, t)}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
