import { useEffect } from 'react';
import { Outlet, useRouterState } from '@tanstack/react-router';
import { SidebarProvider } from '@/hooks/use-sidebar';
import { TabsProvider, useTabs } from '@/hooks/use-tabs';
import { PINNED_ARCHIVIO_ID, PINNED_CHAT_ID } from '@/lib/pinned-tabs';
import { WorkspaceProvider } from '@/hooks/use-workspace';
import { SocketProvider } from '@/hooks/use-socket';
import { ProcessRegistryProvider } from '@/hooks/use-process-registry';
import { ChatStreamProvider } from '@/hooks/use-chat-stream';
import { connectSocket, disconnectSocket } from '@/lib/socket-store';
import { useIsMobile } from '@/hooks/use-mobile';
import { useWorkspaceTheme } from '@/hooks/use-workspace-theme';
import { AppSidebar } from '@/components/organisms/app-sidebar';
import { BottomNavBar } from '@/components/organisms/bottom-nav-bar';
import { TabBar } from '@/components/molecules/tab-bar';
import { MobileHeader } from '@/components/molecules/mobile-header';
import { PageDetailLayout } from '@/components/templates/page-detail-layout';
import { ChatLayout } from '@/components/templates/chat-layout';
import { AuthenticatedLanguageSync } from '@/components/organisms/authenticated-language-sync';
import { AnalyticsTracker } from '@/components/organisms/analytics-tracker';

export function DashboardLayout() {
  useEffect(() => {
    connectSocket();
    return () => disconnectSocket();
  }, []);

  return (
    <WorkspaceProvider>
      <SocketProvider>
        <ProcessRegistryProvider>
          <ChatStreamProvider>
            <SidebarProvider>
              <TabsProvider>
                <AuthenticatedLanguageSync />
                <AnalyticsTracker />
                <DashboardShell />
              </TabsProvider>
            </SidebarProvider>
          </ChatStreamProvider>
        </ProcessRegistryProvider>
      </SocketProvider>
    </WorkspaceProvider>
  );
}

function DashboardShell() {
  useWorkspaceTheme();
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="flex h-screen flex-col bg-background text-foreground pb-14">
        <MobileHeader />
        <TabBar hideAdd />
        <TabContent />
        <BottomNavBar />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TabBar />
        <TabContent />
      </div>
    </div>
  );
}

function TabContent() {
  const { activeView, activeTabId, tabs } = useTabs();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  if (pathname.startsWith('/settings')) {
    return (
      <main className="flex flex-1 flex-col overflow-hidden">
        <Outlet />
      </main>
    );
  }

  if (pathname.startsWith('/add-data')) {
    return (
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Outlet />
      </main>
    );
  }

  if (pathname.startsWith('/workspaces')) {
    return (
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    );
  }

  if (activeTabId) {
    if (activeTabId === PINNED_CHAT_ID) {
      return <ChatLayout chatId={null} />;
    }

    if (activeTabId === PINNED_ARCHIVIO_ID) {
      return (
        <main className="flex flex-1 flex-col overflow-hidden">
          <Outlet />
        </main>
      );
    }

    if (activeTabId === 'add-data') {
      return (
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <Outlet />
        </main>
      );
    }

    if (activeTabId.startsWith('company:')) {
      return (
        <main className="flex flex-1 flex-col overflow-hidden">
          <Outlet />
        </main>
      );
    }

    const tab = tabs.find((t) => t.id === activeTabId);

    if (tab?.source === 'chat') {
      return <ChatLayout chatId={activeTabId} />;
    }

    return <PageDetailLayout pageId={activeTabId} />;
  }

  if (activeView === 'home') {
    return (
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    );
  }

  if (activeView === 'archivio') {
    return (
      <main className="flex flex-1 flex-col overflow-hidden">
        <Outlet />
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      <Outlet />
    </main>
  );
}
