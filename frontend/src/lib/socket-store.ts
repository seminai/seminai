import { createContext } from 'react';
import { io, type Socket } from 'socket.io-client';

export const SocketContext = createContext<Socket | null>(null);

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

let socketInstance: Socket | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function getSocketSnapshot(): Socket | null {
  return socketInstance;
}

export function subscribeSocket(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function connectSocket() {
  if (socketInstance) return;
  const apiUrl = new URL(BASE_URL, window.location.origin);
  const socketPath = `${apiUrl.pathname.replace(/\/$/, '') || ''}/socket.io`;
  socketInstance = io(apiUrl.origin, {
    withCredentials: true,
    path: socketPath,
    transports: ['websocket', 'polling'],
  });
  notify();
}

export function disconnectSocket() {
  if (!socketInstance) return;
  socketInstance.disconnect();
  socketInstance = null;
  notify();
}

window.addEventListener('auth:unauthorized', () => disconnectSocket());
