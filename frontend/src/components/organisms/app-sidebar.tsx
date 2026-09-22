import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useSidebar } from '@/hooks/use-sidebar';
import { useTabs } from '@/hooks/use-tabs';
import type { ViewId } from '@/hooks/use-tabs';
import { useWorkspace } from '@/hooks/use-workspace';
import { useGetWorkspacesId } from '@/generated/api/workspaces/workspaces';
import { extractObject } from '@/lib/api-response';
import { SidebarNavItem } from '@/components/atoms/sidebar-nav-item';
import { SidebarCollections } from '@/components/molecules/sidebar-collections';
import { SidebarPlanCard } from '@/components/molecules/sidebar-plan-card';
import { SidebarUserMenu } from '@/components/molecules/sidebar-user-menu';
import { WorkspaceSwitcher } from '@/components/molecules/workspace-switcher';
import { Button } from '@/components/ui/button';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from '@/config/navigation';
import type { WorkspacePlan } from '@/types/workspace';

export function AppSidebar() {
  const { t } = useTranslation();
  const { isOpen, toggle } = useSidebar();
  const { activeView, activeTabId, tabs, setActiveView } = useTabs();
  const activeTab = activeTabId ? tabs.find((t) => t.id === activeTabId) : null;
  const navigate = useNavigate();
  const { pathname, activeCompanyId } = useRouterState({
    select: (state) => ({
      pathname: state.location.pathname,
      activeCompanyId: (state.location.search as { companyId?: string }).companyId,
    }),
  });
  const collapsed = !isOpen;
  const { workspaces, activeWorkspaceId, activeWorkspaceKind, setActiveWorkspaceId } = useWorkspace();
  const isDefaultWs = activeWorkspaceId === 'seminai-default';
  const wsDetail = useGetWorkspacesId(activeWorkspaceId, { query: { enabled: !isDefaultWs } });
  const wsRaw = !isDefaultWs ? extractObject(wsDetail.data?.data, 'workspace') : null;
  const currentPlan = (wsRaw?.plan as WorkspacePlan) ?? 'FREE';

  function handleSwitchWorkspace(id: string) {
    setActiveWorkspaceId(id);
    if (pathname.startsWith('/settings')) {
      void navigate({ to: '/settings', search: { section: 'workspace' } });
    }
  }

  function handleCreateWorkspace() {
    void navigate({ to: '/workspaces/new' });
  }

  function handleWorkspaceSettings() {
    void navigate({ to: '/settings', search: { section: 'workspace' } });
  }

  function handleMainNavClick(nextView: ViewId, path: string) {
    setActiveView(nextView);
    void navigate({ to: path, search: {} });
  }

  return (
    <aside
      className={cn(
        'group flex h-screen shrink-0 flex-col overflow-hidden border-r bg-background transition-[width] duration-200',
        collapsed ? 'w-14' : 'w-64',
      )}
    >
      {/* Header */}
      {collapsed ? (
        <div className="flex flex-col items-center gap-1 px-1 py-2">
          <WorkspaceSwitcher
            workspaces={workspaces}
            activeId={activeWorkspaceId}
            activeKind={activeWorkspaceKind}
            onSwitch={handleSwitchWorkspace}
            onCreate={handleCreateWorkspace}
            onSettings={handleWorkspaceSettings}
            collapsed
          />
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            onClick={toggle}
            title={t('settings.sidebar.expand')}
          >
            <PanelLeftOpen className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between px-2 py-3">
          <WorkspaceSwitcher
            workspaces={workspaces}
            activeId={activeWorkspaceId}
            activeKind={activeWorkspaceKind}
            onSwitch={handleSwitchWorkspace}
            onCreate={handleCreateWorkspace}
            onSettings={handleWorkspaceSettings}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            onClick={toggle}
            title={t('settings.sidebar.collapse')}
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Main section (fixed nav + collections with internal scroll) */}
      <div className="min-h-0 flex flex-1 flex-col overflow-hidden">
        {/* Navigation */}
        <nav className={cn('flex flex-col gap-0.5', collapsed ? 'px-1' : 'px-2')}>
          {NAV_ITEMS.map((item) => (
            <SidebarNavItem
              key={item.labelKey}
              icon={item.icon}
              label={t(item.labelKey)}
              isActive={activeTabId === null && activeView === item.tabId}
              isSoftActive={activeTab?.source === item.tabId}
              collapsed={collapsed}
              onClick={() => handleMainNavClick(item.tabId as ViewId, item.path)}
            />
          ))}
        </nav>

        {/* Collections */}
        <SidebarCollections
          collapsed={collapsed}
          activeCompanyId={activeCompanyId}
        />
      </div>

      {/* Bottom section */}
      <div className={cn('flex flex-col gap-2 pb-3', collapsed ? 'px-1' : 'px-3')}>
        <SidebarPlanCard plan={currentPlan} collapsed={collapsed} />
        <SidebarUserMenu collapsed={collapsed} />
      </div>
    </aside>
  );
}
