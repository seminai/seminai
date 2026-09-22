import { Server as SocketServer } from 'socket.io';

interface UserConnection {
  readonly socketId: string;
  readonly jobId: string;
  readonly connectedAt: Date;
}

interface PendingJobCompletion {
  readonly jobId: string;
  readonly completedAt: Date;
  readonly timeoutId: NodeJS.Timeout;
}

type JobStatusReader = {
  getJobStatus(jobId: string): Promise<JobCompletionStatus>;
};

interface JobCompletionStatus {
  readonly state: string;
  readonly progress?: number;
  readonly result?: unknown;
  readonly failedReason?: string;
}

interface JobCompletionEvent {
  readonly jobId: string;
  readonly message: string;
  readonly state?: string;
  readonly progress?: number;
  readonly result?: unknown;
  readonly failedReason?: string;
}

/**
 * Manages Socket.IO connections with limits and automatic cleanup
 * - Limits connections per user (max 10)
 * - Tracks job completions
 * - Closes connections only after all final logs are sent
 */
export class SocketConnectionManager {
  private static instance: SocketConnectionManager | null = null;
  private readonly userConnections: Map<string, UserConnection[]> = new Map(); // userId -> connections
  private readonly completedJobs: Map<string, PendingJobCompletion> = new Map(); // jobId -> pending completion
  private readonly MAX_CONNECTIONS_PER_USER = 10;
  private readonly GRACE_PERIOD_MS = 5000; // 5 secondi per inviare tutti i log finali
  private readonly COMPLETED_JOB_TTL_MS = 24 * 60 * 60 * 1000; // 24 ore

  private constructor() {}

  static getInstance(): SocketConnectionManager {
    if (!SocketConnectionManager.instance) {
      SocketConnectionManager.instance = new SocketConnectionManager();
    }
    return SocketConnectionManager.instance;
  }

  /**
   * Verifica se un utente può aprire una nuova connessione
   */
  canUserConnect(userId: string): { allowed: boolean; reason?: string } {
    const connections = this.userConnections.get(userId) || [];

    if (connections.length >= this.MAX_CONNECTIONS_PER_USER) {
      return {
        allowed: false,
        reason: `Maximum ${this.MAX_CONNECTIONS_PER_USER} connections per user exceeded`,
      };
    }

    return { allowed: true };
  }

  /**
   * Verifica se un job è completato e non può più ricevere connessioni
   */
  isJobCompleted(jobId: string): boolean {
    return this.completedJobs.has(jobId);
  }

  /**
   * Registra una nuova connessione
   */
  registerConnection(userId: string, socketId: string, jobId: string): void {
    const connections = this.userConnections.get(userId) || [];
    connections.push({
      socketId,
      jobId,
      connectedAt: new Date(),
    });
    this.userConnections.set(userId, connections);
  }

  /**
   * Rimuove una connessione
   */
  removeConnection(userId: string, socketId: string): void {
    const connections = this.userConnections.get(userId) || [];
    const filtered = connections.filter((c) => c.socketId !== socketId);

    if (filtered.length === 0) {
      this.userConnections.delete(userId);
    } else {
      this.userConnections.set(userId, filtered);
    }
  }

  /**
   * Rimuove tutte le connessioni di un socket (utile per disconnect)
   */
  removeSocketConnections(socketId: string): void {
    for (const [userId, connections] of this.userConnections.entries()) {
      const filtered = connections.filter((c) => c.socketId !== socketId);
      if (filtered.length === 0) {
        this.userConnections.delete(userId);
      } else if (filtered.length !== connections.length) {
        this.userConnections.set(userId, filtered);
      }
    }
  }

  /**
   * Marca un job come completato e programma la chiusura dopo il grace period
   * Questo permette l'invio di tutti i log finali prima di chiudere
   */
  async scheduleJobCompletion(
    jobId: string,
    io: SocketServer,
    jobQueue: JobStatusReader,
  ): Promise<void> {
    // Se già in pending, non fare nulla
    if (this.completedJobs.has(jobId)) {
      return;
    }

    // Verifica lo stato del job
    let status: JobCompletionStatus;
    try {
      status = await jobQueue.getJobStatus(jobId);
      if (status.state !== 'completed' && status.state !== 'failed') {
        return; // Job non ancora completato
      }
    } catch (error) {
      console.warn(`[SOCKET-MANAGER] Could not check job status for ${jobId}:`, error);
      return;
    }

    // Notifica i client che il job è completato (ma non chiudere ancora)
    const room = `job:${jobId}`;
    const socketsInRoom = await io.in(room).fetchSockets();

    if (socketsInRoom.length === 0) {
      // Nessuna connessione, marca come completato direttamente
      this.completedJobs.set(jobId, {
        jobId,
        completedAt: new Date(),
        timeoutId: setTimeout(() => {
          this.completedJobs.delete(jobId);
        }, this.COMPLETED_JOB_TTL_MS) as unknown as NodeJS.Timeout,
      });
      return;
    }

    // Notifica i client che il job è completato
    for (const socket of socketsInRoom) {
      socket.emit('job:completing', {
        jobId,
        message: 'Job completed. Final logs will be sent, then connection will close.',
        gracePeriodMs: this.GRACE_PERIOD_MS,
      });
    }

    console.log(
      `[SOCKET-MANAGER] Job ${jobId} completed. ${socketsInRoom.length} connections will close in ${this.GRACE_PERIOD_MS}ms after final logs.`,
    );

    // Programma la chiusura dopo il grace period
    const timeoutId = setTimeout(async () => {
      await this.closeJobConnections(jobId, io, status);
    }, this.GRACE_PERIOD_MS) as unknown as NodeJS.Timeout;

    // Marca come completato (pending chiusura)
    this.completedJobs.set(jobId, {
      jobId,
      completedAt: new Date(),
      timeoutId,
    });

    // Cleanup dopo TTL
    setTimeout(() => {
      const pending = this.completedJobs.get(jobId);
      if (pending) {
        clearTimeout(pending.timeoutId as unknown as NodeJS.Timeout);
        this.completedJobs.delete(jobId);
      }
    }, this.COMPLETED_JOB_TTL_MS);
  }

  /**
   * Chiude tutte le connessioni a un job completato
   */
  private async closeJobConnections(
    jobId: string,
    io: SocketServer,
    status?: JobCompletionStatus,
  ): Promise<void> {
    const room = `job:${jobId}`;
    const socketsInRoom = await io.in(room).fetchSockets();
    const completionEvent: JobCompletionEvent = {
      jobId,
      message: 'Job completed. Connection closing.',
      state: status?.state,
      progress: status?.progress,
      result: status?.result,
      failedReason: status?.failedReason,
    };

    for (const socket of socketsInRoom) {
      // Invia evento finale prima di chiudere
      socket.emit('job:completed', completionEvent);

      // Lascia la room
      socket.leave(room);

      // Rimuove dalla registrazione usando socket.id
      this.removeSocketConnections(socket.id);
    }

    console.log(
      `[SOCKET-MANAGER] Closed ${socketsInRoom.length} connections for completed job ${jobId}`,
    );
  }

  /**
   * Cleanup periodico delle connessioni orfane
   */
  cleanupOrphanedConnections(io: SocketServer): void {
    setInterval(() => {
      for (const [userId, connections] of this.userConnections.entries()) {
        const validConnections = connections.filter((conn) => {
          const socket = io.sockets.sockets.get(conn.socketId);
          return socket && socket.connected;
        });

        if (validConnections.length === 0) {
          this.userConnections.delete(userId);
        } else if (validConnections.length !== connections.length) {
          this.userConnections.set(userId, validConnections);
        }
      }
    }, 60000); // Cleanup ogni minuto
  }

  /**
   * Ottiene statistiche delle connessioni
   */
  getStats(): {
    totalUsers: number;
    totalConnections: number;
    pendingCompletions: number;
    connectionsByUser: Record<string, number>;
  } {
    const connectionsByUser: Record<string, number> = {};
    let totalConnections = 0;

    for (const [userId, connections] of this.userConnections.entries()) {
      connectionsByUser[userId] = connections.length;
      totalConnections += connections.length;
    }

    return {
      totalUsers: this.userConnections.size,
      totalConnections,
      pendingCompletions: this.completedJobs.size,
      connectionsByUser,
    };
  }

  /**
   * Forza la chiusura immediata di un job (per testing o emergenze)
   */
  async forceCloseJob(jobId: string, io: SocketServer): Promise<void> {
    const pending = this.completedJobs.get(jobId);
    if (pending) {
      clearTimeout(pending.timeoutId as unknown as NodeJS.Timeout);
    }
    await this.closeJobConnections(jobId, io);
    this.completedJobs.delete(jobId);
  }
}
