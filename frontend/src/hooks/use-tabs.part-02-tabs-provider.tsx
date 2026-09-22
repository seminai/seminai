import { useNavigate, useRouterState, type NavigateOptions } from '@tanstack/react-router';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { PINNED_ARCHIVIO_ID, PINNED_CHAT_ID } from '@/lib/pinned-tabs';
import type {
  DerivedState,
  TabData,
  TabsContextValue,
  ViewId,
} from './use-tabs.part-01-view-id';
import {
  COMPANY_TAB_PREFIX,
  PINNED_TABS,
  TabsContext,
  areTabsEqual,
  createFallbackTab,
  deriveFromUrl,
  loadTabsFromStorage,
  normalizePathname,
  parseDynamicPath,
  saveTabsToStorage,
  urlForTab,
  urlForView,
} from './use-tabs.part-01-view-id';

export function TabsProvider({ children }: { readonly children: React.ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => normalizePathname(state.location.pathname),
  });
  const search = useRouterState({
    select: (state) => state.location.search as Record<string, unknown>,
  });

  const [tabs, setTabs] = useState<readonly TabData[]>(() => loadTabsFromStorage());

  // URL is the single source of truth for active view + active tab.
  // Derived with useMemo: no setState, no circuit breaker, no effect cycle.
  const { activeView, activeTabId } = useMemo<DerivedState>(
    () => deriveFromUrl(pathname, search),
    [pathname, search],
  );

  // Persist only the tab list; active state lives in the URL.
  useEffect(() => {
    saveTabsToStorage(tabs);
  }, [tabs]);

  // Monodirectional fallback: when the URL points to a tab id we don't know yet
  // (e.g. deep link, direct paste), register a placeholder tab. Only mutates state,
  // never triggers navigate — so it cannot feed back into the URL derivation above.
  // The setState-in-effect lint is silenced on purpose: this is a legitimate
  // "sync with external system" pattern (URL -> tab list), and the `tabs.some(...)`
  // guard at the top ensures it stops after the first run for the same id.
  useEffect(() => {
    if (!activeTabId) return;
    if (tabs.some((t) => t.id === activeTabId)) return;

    if (activeTabId === 'add-data') {

      setTabs((prev) =>
        prev.some((t) => t.id === 'add-data')
          ? prev
          : [...prev, createFallbackTab('add-data', 'archivio', search)],
      );
      return;
    }
    if (activeTabId.startsWith(COMPANY_TAB_PREFIX)) {
      setTabs((prev) =>
        prev.some((t) => t.id === activeTabId)
          ? prev
          : [...prev, createFallbackTab(activeTabId, 'archivio', search)],
      );
      return;
    }
    if (activeTabId === PINNED_ARCHIVIO_ID || activeTabId === PINNED_CHAT_ID) {
      setTabs((prev) => {
        if (prev.some((t) => t.id === activeTabId)) return prev;
        const pinned = PINNED_TABS.find((t) => t.id === activeTabId);
        return pinned ? [pinned, ...prev] : prev;
      });
      return;
    }
    const dynamic = parseDynamicPath(pathname);
    if (!dynamic) return;
    setTabs((prev) =>
      prev.some((t) => t.id === dynamic.id)
        ? prev
        : [...prev, createFallbackTab(dynamic.id, dynamic.source, search)],
    );
  }, [activeTabId, pathname, search, tabs]);

  const addTab = useCallback(
    (tab: TabData, navigateOverride?: NavigateOptions) => {
      setTabs((prev) => {
        const existing = prev.find((t) => t.id === tab.id);
        if (!existing) return [...prev, tab];
        if (areTabsEqual(existing, tab)) return prev;
        return prev.map((t) => (t.id === tab.id ? tab : t));
      });
      void navigate(navigateOverride ?? urlForTab(tab));
    },
    [navigate],
  );

  const addTabs = useCallback(
    (newTabs: readonly TabData[]) => {
      if (newTabs.length === 0) return;
      setTabs((prev) => {
        const next = [...prev];
        for (const tab of newTabs) {
          const idx = next.findIndex((t) => t.id === tab.id);
          if (idx >= 0) next[idx] = tab;
          else next.push(tab);
        }
        return next;
      });
      const last = newTabs[newTabs.length - 1];
      void navigate(urlForTab(last));
    },
    [navigate],
  );

  const removeTab = useCallback(
    async (id: string) => {
      const index = tabs.findIndex((t) => t.id === id);
      if (index < 0) return;
      const next = tabs.filter((t) => t.id !== id);
      if (activeTabId === id) {
        const target =
          next.length === 0
            ? urlForView('home')
            : urlForTab(next[Math.min(index, next.length - 1)]);
        await navigate(target);
      }
      setTabs(next);
    },
    [tabs, activeTabId, navigate],
  );

  const setActiveTab = useCallback(
    (id: string) => {
      const target = tabs.find((t) => t.id === id);
      if (!target) return;
      void navigate(urlForTab(target));
    },
    [navigate, tabs],
  );

  const setActiveView = useCallback(
    (view: ViewId) => {
      if (view === 'archivio' || view === 'chat') {
        const pinnedId = view === 'archivio' ? PINNED_ARCHIVIO_ID : PINNED_CHAT_ID;
        const pinnedTab = PINNED_TABS.find((t) => t.id === pinnedId);
        if (pinnedTab) {
          setTabs((prev) => (prev.some((t) => t.id === pinnedId) ? prev : [...prev, pinnedTab]));
        }
      }
      void navigate(urlForView(view));
    },
    [navigate],
  );

  const value = useMemo<TabsContextValue>(
    () => ({
      activeView,
      setActiveView,
      tabs,
      activeTabId,
      addTab,
      addTabs,
      removeTab,
      setActiveTab,
    }),
    [activeView, setActiveView, tabs, activeTabId, addTab, addTabs, removeTab, setActiveTab],
  );

  return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>;
}

export function useTabs(): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('useTabs must be used within TabsProvider');
  return ctx;
}
