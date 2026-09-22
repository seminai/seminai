import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useTabs } from '@/hooks/use-tabs';
import { PINNED_ARCHIVIO_ID, PINNED_CHAT_ID } from '@/lib/pinned-tabs';
import { useWorkspace } from '@/hooks/use-workspace';
import { TabItem } from '@/components/atoms/tab-item';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

const COMPANY_TAB_PREFIX = 'company:';
const DEFAULT_WORKSPACE_ID = 'seminai-default';

interface TabBarProps {
  readonly hideAdd?: boolean;
}

export function TabBar({ hideAdd }: TabBarProps) {
  const { t } = useTranslation();
  const { tabs, activeTabId, addTab, setActiveTab, removeTab } = useTabs();
  const { workspaces, activeWorkspaceId } = useWorkspace();
  const scrollRef = useRef<HTMLDivElement>(null);
  // Subtitle for company tabs is enriched at render time from the current workspace,
  // instead of being stored in persisted TabData. This avoids feeding an unstable
  // dependency into the tab state (root cause of the previous TabsProvider loop).
  const workspaceSubtitle =
    activeWorkspaceId && activeWorkspaceId !== DEFAULT_WORKSPACE_ID
      ? workspaces.find((w) => w.id === activeWorkspaceId)?.name
      : undefined;

  function resolveSubtitle(tab: (typeof tabs)[number]): string | undefined {
    if (tab.subtitle) return tab.subtitle;
    if (tab.id.startsWith(COMPANY_TAB_PREFIX)) return workspaceSubtitle;
    return undefined;
  }

  function resolveTitle(tab: (typeof tabs)[number]): string {
    if (tab.id === PINNED_ARCHIVIO_ID) return t('common.archive');
    if (tab.id === PINNED_CHAT_ID) return t('common.chat');
    if (tab.id === 'add-data') return t('home.addData');
    return tab.title;
  }

  return (
    <div className="flex h-11 items-center border-b bg-background">
      <div
        ref={scrollRef}
        className="flex h-full flex-1 items-center overflow-x-auto scrollbar-none"
      >
        {tabs.map((tab) => (
          <TabItem
            key={tab.id}
            id={tab.id}
            title={resolveTitle(tab)}
            subtitle={resolveSubtitle(tab)}
            format={tab.format}
            source={tab.source}
            isActive={tab.id === activeTabId}
            closable
            onClick={() => setActiveTab(tab.id)}
            onClose={() => removeTab(tab.id)}
          />
        ))}
      </div>
      {!hideAdd && (
        <div className="flex h-full shrink-0 items-center px-3">
          <Button
            size="sm"
            onClick={() =>
              addTab({ id: 'add-data', title: t('home.addData'), format: '-', source: 'archivio' })
            }
          >
            <Plus className="mr-1.5 h-4 w-4" />
            {t('home.add')}
          </Button>
        </div>
      )}
    </div>
  );
}
