import { useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { SocketContext, getSocketSnapshot, subscribeSocket } from '@/lib/socket-store';

export function SocketProvider({ children }: { readonly children: ReactNode }) {
  const socket = useSyncExternalStore(subscribeSocket, getSocketSnapshot, () => null);
  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
}
