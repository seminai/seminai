import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate, useRouterState, type NavigateOptions } from '@tanstack/react-router';
import { PINNED_ARCHIVIO_ID, PINNED_CHAT_ID } from '@/lib/pinned-tabs';

export type ViewId = 'home' | 'archivio' | 'chat' | 'folders';

export interface TabData {
  readonly id: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly format: string;
  readonly source: ViewId;
}

interface TabsContextValue {
  readonly activeView: ViewId;
  readonly setActiveView: (view: ViewId) => void;
  readonly tabs: readonly TabData[];
  readonly activeTabId: string | null;
  readonly addTab: (tab: TabData, navigateOverride?: NavigateOptions) => void;
  readonly addTabs: (tabs: readonly TabData[]) => void;
  readonly removeTab: (id: string) => Promise<void>;
  readonly setActiveTab: (id: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);
const STORAGE_KEY = 'seminai-tabs-state-v1';
const COMPANY_TAB_PREFIX = 'company:' as const;

const PINNED_TABS: readonly TabData[] = [
  { id: PINNED_ARCHIVIO_ID, title: 'Archivio', format: '-', source: 'archivio' },
  { id: PINNED_CHAT_ID, title: 'Chat', format: '-', source: 'chat' },
] as const;

const VIEW_PATH_MAP: Record<ViewId, string> = {
  home: '/home',
  archivio: '/archivio',
  chat: '/chat',
  folders: '/folders',
} as const;

const PATH_VIEW_MAP: Record<string, ViewId> = {
  '/home': 'home',
  '/archivio': 'archivio',
  '/chat': 'chat',
  '/folders': 'folders',
} as const;

function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function isViewId(value: unknown): value is ViewId {
  return value === 'home' || value === 'archivio' || value === 'chat' || value === 'folders';
}

function isTabData(value: unknown): value is TabData {
  if (!value || typeof value !== 'object') return false;
  const t = value as Partial<TabData>;
  return (
    typeof t.id === 'string' &&
    typeof t.title === 'string' &&
    typeof t.format === 'string' &&
    isViewId(t.source)
  );
}

interface PersistedTabs {
  readonly tabs: readonly TabData[];
}

function loadTabsFromStorage(): readonly TabData[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...PINNED_TABS];
    const parsed = JSON.parse(raw) as Partial<PersistedTabs> & {
      readonly activeView?: unknown;
      readonly activeTabId?: unknown;
    };
    const rawTabs = Array.isArray(parsed.tabs) ? parsed.tabs.filter(isTabData) : [];
    const migrated = rawTabs.map((t) =>
      t.id === 'new-files' ? { ...t, id: 'add-data', title: 'Aggiungi dati' } : t,
    );
    return migrated;
  } catch {
    return [...PINNED_TABS];
  }
}

function saveTabsToStorage(tabs: readonly TabData[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tabs } satisfies PersistedTabs));
  } catch {
    // localStorage unavailable — silently ignore
  }
}

function parseDynamicPath(
  pathname: string,
): { readonly source: 'archivio' | 'chat'; readonly id: string } | null {
  if (pathname.startsWith('/archivio/')) {
    const id = pathname.slice('/archivio/'.length).trim();
    if (id) return { source: 'archivio', id: decodeURIComponent(id) };
  }
  if (pathname.startsWith('/chat/')) {
    const id = pathname.slice('/chat/'.length).trim();
    if (id) return { source: 'chat', id: decodeURIComponent(id) };
  }
  return null;
}

function createFallbackTab(
  id: string,
  source: 'archivio' | 'chat',
  search: Record<string, unknown>,
): TabData {
  if (id === 'add-data') {
    return { id, title: 'Aggiungi dati', format: '-', source: 'archivio' };
  }
  if (id.startsWith(COMPANY_TAB_PREFIX)) {
    const companyName = typeof search.companyName === 'string' ? search.companyName : null;
    return {
      id,
      title: companyName ?? 'Azienda',
      format: '-',
      source: 'archivio',
    };
  }
  return {
    id,
    title: source === 'chat' ? 'Chat' : 'Archivio',
    format: '-',
    source,
  };
}

interface DerivedState {
  readonly activeView: ViewId;
  readonly activeTabId: string | null;
}

/**
 * Pure function that maps URL (pathname + search) to the active view/tab.
 * This is the single source of truth: no setState, no effect loop.
 */
function deriveFromUrl(pathname: string, search: Record<string, unknown>): DerivedState {
  if (pathname === '/add-data') {
    return { activeView: 'archivio', activeTabId: 'add-data' };
  }
  if (pathname === '/archivio') {
    const companyId = typeof search.companyId === 'string' ? search.companyId : null;
    if (companyId) {
      return { activeView: 'archivio', activeTabId: `${COMPANY_TAB_PREFIX}${companyId}` };
    }
    return { activeView: 'archivio', activeTabId: PINNED_ARCHIVIO_ID };
  }
  if (pathname === '/chat') {
    return { activeView: 'chat', activeTabId: PINNED_CHAT_ID };
  }
  const dynamic = parseDynamicPath(pathname);
  if (dynamic) {
    return { activeView: dynamic.source, activeTabId: dynamic.id };
  }
  const view = PATH_VIEW_MAP[pathname];
  if (view) {
    return { activeView: view, activeTabId: null };
  }
  // Unknown paths (/, /settings/*, /login ...) default to home view with no active tab.
  return { activeView: 'home', activeTabId: null };
}

function urlForView(view: ViewId): NavigateOptions {
  return { to: VIEW_PATH_MAP[view], search: {} } as NavigateOptions;
}

function urlForTab(tab: TabData): NavigateOptions {
  if (tab.id === PINNED_ARCHIVIO_ID) {
    return urlForView('archivio');
  }
  if (tab.id === PINNED_CHAT_ID) {
    return urlForView('chat');
  }
  if (tab.id === 'add-data') {
    return { to: '/add-data', search: {} } as NavigateOptions;
  }
  if (tab.id.startsWith(COMPANY_TAB_PREFIX)) {
    const companyId = tab.id.slice(COMPANY_TAB_PREFIX.length);
    return {
      to: '/archivio',
      search: { companyId, companyName: tab.title },
    } as NavigateOptions;
  }
  if (tab.source === 'chat') {
    return { to: `/chat/${encodeURIComponent(tab.id)}` } as NavigateOptions;
  }
  return { to: `/archivio/${encodeURIComponent(tab.id)}` } as NavigateOptions;
}

function areTabsEqual(a: TabData, b: TabData): boolean {
  return (
    a.id === b.id &&
    a.title === b.title &&
    a.subtitle === b.subtitle &&
    a.format === b.format &&
    a.source === b.source
  );
}

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
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
