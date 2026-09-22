import type { Server as SocketServer } from 'socket.io';
import { getGlobalSocketIO } from './chat-socket-emitter';
import { getUserSessionBus } from '../services/user-session-bus';

/**
 * Agent status payload for the multi-agent dashboard.
 */
export interface AgentStatusUpdate {
  readonly threadId: string;
  readonly status:
    | 'idle'
    | 'discovering'
    | 'planning'
    | 'thinking'
    | 'executing_tool'
    | 'awaiting_approval'
    | 'completed'
    | 'error';
  readonly currentTool?: string;
  readonly loopCounter?: number;
  readonly timestamp: number;
}

/**
 * Emits events to the user-level room for multi-agent dashboard.
 * All active agents for the same user broadcast their status here.
 */
export class UserRoomEmitter {
  private readonly room: string;

  constructor(
    private readonly io: SocketServer,
    userId: string,
  ) {
    this.room = `user:${userId}:agents`;
  }

  /**
   * Emits an agent status update to the user room.
   */
  emitAgentStatus(update: AgentStatusUpdate): void {
    this.io.to(this.room).emit('agent:status_update', update);
  }

  /**
   * Emits the full list of active agent sessions for the user.
   */
  emitSessionList(
    sessions: ReadonlyArray<{
      threadId: string;
      status: string;
      loopCounter: number;
    }>,
  ): void {
    this.io.to(this.room).emit('agent:session_list', {
      sessions,
      timestamp: Date.now(),
    });
  }

  /**
   * Emits a resource contention warning to the user room.
   */
  emitContentionWarning(warning: {
    threadId: string;
    conflictingThreadId: string;
    resourceDescription: string;
  }): void {
    this.io.to(this.room).emit('agent:contention_warning', {
      ...warning,
      timestamp: Date.now(),
    });
  }
}

/**
 * Creates a UserRoomEmitter if Socket.IO is available, otherwise returns null.
 */
export function createUserRoomEmitter(userId: string): UserRoomEmitter | null {
  const io = getGlobalSocketIO();
  if (!io) return null;
  return new UserRoomEmitter(io, userId);
}

/**
 * Joins a socket to the user's multi-agent room and sends the current session list.
 */
export function joinUserAgentRoom(
  _io: SocketServer,
  socket: import('socket.io').Socket,
  userId: string,
): void {
  const room = `user:${userId}:agents`;
  socket.join(room);
  const bus = getUserSessionBus();
  const activeThreads = bus.getActiveThreads(userId);
  const sessions = [...activeThreads].map((threadId) => ({
    threadId,
    status: 'idle' as const,
    loopCounter: 0,
  }));
  socket.emit('agent:session_list', { sessions, timestamp: Date.now() });
}
