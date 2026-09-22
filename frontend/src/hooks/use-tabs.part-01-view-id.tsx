import type { NavigateOptions } from '@tanstack/react-router';
import { createContext } from 'react';
import { PINNED_ARCHIVIO_ID, PINNED_CHAT_ID } from '@/lib/pinned-tabs';

export type ViewId = 'home' | 'archivio' | 'chat' | 'folders';

export interface TabData {
  readonly id: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly format: string;
  readonly source: ViewId;
}

export interface TabsContextValue {
  readonly activeView: ViewId;
  readonly setActiveView: (view: ViewId) => void;
  readonly tabs: readonly TabData[];
  readonly activeTabId: string | null;
  readonly addTab: (tab: TabData, navigateOverride?: NavigateOptions) => void;
  readonly addTabs: (tabs: readonly TabData[]) => void;
  readonly removeTab: (id: string) => Promise<void>;
  readonly setActiveTab: (id: string) => void;
}

export const TabsContext = createContext<TabsContextValue | null>(null);

export const STORAGE_KEY = 'seminai-tabs-state-v1';

export const COMPANY_TAB_PREFIX = 'company:' as const;

export const PINNED_TABS: readonly TabData[] = [
  { id: PINNED_ARCHIVIO_ID, title: 'Archivio', format: '-', source: 'archivio' },
  { id: PINNED_CHAT_ID, title: 'Chat', format: '-', source: 'chat' },
] as const;

export const VIEW_PATH_MAP: Record<ViewId, string> = {
  home: '/home',
  archivio: '/archivio',
  chat: '/chat',
  folders: '/folders',
} as const;

export const PATH_VIEW_MAP: Record<string, ViewId> = {
  '/home': 'home',
  '/archivio': 'archivio',
  '/chat': 'chat',
  '/folders': 'folders',
} as const;

export function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export function isViewId(value: unknown): value is ViewId {
  return value === 'home' || value === 'archivio' || value === 'chat' || value === 'folders';
}

export function isTabData(value: unknown): value is TabData {
  if (!value || typeof value !== 'object') return false;
  const t = value as Partial<TabData>;
  return (
    typeof t.id === 'string' &&
    typeof t.title === 'string' &&
    typeof t.format === 'string' &&
    isViewId(t.source)
  );
}

export interface PersistedTabs {
  readonly tabs: readonly TabData[];
}

export function loadTabsFromStorage(): readonly TabData[] {
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

export function saveTabsToStorage(tabs: readonly TabData[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tabs } satisfies PersistedTabs));
  } catch {
    // localStorage unavailable — silently ignore
  }
}

export function parseDynamicPath(
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

export function createFallbackTab(
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

export interface DerivedState {
  readonly activeView: ViewId;
  readonly activeTabId: string | null;
}

/**
 * Pure function that maps URL (pathname + search) to the active view/tab.
 * This is the single source of truth: no setState, no effect loop.
 */
export function deriveFromUrl(pathname: string, search: Record<string, unknown>): DerivedState {
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

export function urlForView(view: ViewId): NavigateOptions {
  return { to: VIEW_PATH_MAP[view], search: {} } as NavigateOptions;
}

export function urlForTab(tab: TabData): NavigateOptions {
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

export function areTabsEqual(a: TabData, b: TabData): boolean {
  return (
    a.id === b.id &&
    a.title === b.title &&
    a.subtitle === b.subtitle &&
    a.format === b.format &&
    a.source === b.source
  );
}
