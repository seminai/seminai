import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { useTabs } from '@/hooks/use-tabs';
import { NAV_ITEMS } from '@/config/navigation';
import { cn } from '@/lib/utils';
import { Plus } from 'lucide-react';
import type { ViewId } from '@/hooks/use-tabs';

export function BottomNavBar() {
  const { t } = useTranslation();
  const { activeView, activeTabId, tabs, setActiveView, addTab } = useTabs();
  const activeTab = activeTabId ? tabs.find((t) => t.id === activeTabId) : null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-around border-t bg-background pb-[env(safe-area-inset-bottom)]">
      {NAV_ITEMS.map((item, idx) => {
        const isActive = activeTabId === null && activeView === item.tabId;
        const isSoftActive = activeTab?.source === item.tabId;

        return (
          <Fragment key={item.tabId}>
            <button
              type="button"
              onClick={() => setActiveView(item.tabId as ViewId)}
              className={cn(
                'flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors',
                isActive
                  ? 'text-primary'
                  : isSoftActive
                    ? 'text-foreground'
                    : 'text-muted-foreground active:text-foreground',
              )}
            >
              {item.icon}
              <span>{t(item.labelKey)}</span>
            </button>

            {/* "+" button after the first nav item (Home) */}
            {idx === 0 && (
              <button
                key="add-file"
                type="button"
                onClick={() =>
                  addTab({ id: 'add-data', title: t('home.addData'), format: '-', source: 'archivio' })
                }
                className="flex flex-col items-center gap-0.5 px-4 py-2 text-xs font-medium text-muted-foreground transition-colors active:text-foreground"
              >
                <Plus className="h-5 w-5" />
                <span>{t('home.add')}</span>
              </button>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
