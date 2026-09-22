import { Home, Archive, MessageSquare } from 'lucide-react';

export interface NavItem {
  readonly tabId: string;
  readonly path: string;
  readonly icon: React.ReactNode;
  readonly labelKey: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { tabId: 'home', path: '/home', icon: <Home className="h-5 w-5" />, labelKey: 'common.home' },
  { tabId: 'archivio', path: '/archivio', icon: <Archive className="h-5 w-5" />, labelKey: 'common.archive' },
  { tabId: 'chat', path: '/chat', icon: <MessageSquare className="h-5 w-5" />, labelKey: 'common.chat' },
];
