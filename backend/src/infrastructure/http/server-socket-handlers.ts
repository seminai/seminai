import { Server as SocketServer } from 'socket.io';
import { getDosageAgentQueue } from '../queue/DosageAgentQueue';
import { getConformityCheckerQueue } from '../queue/ConformityCheckerQueue';
import { getProductJobCreationQueue } from '../queue/ProductJobCreationQueue';
import { getOnboardingExtractionQueue } from '../queue/OnboardingExtractionQueue';
import { getPreclassificationOwner } from '../services/extraction/preclassification-store';
import { DosageLoggerService } from '../services/dosage-logger.service';
import { SocketConnectionManager } from './middlewares/socket-connection-manager';
import { AuthenticatedSocket } from './middlewares/socket-auth.middleware';
import { prisma } from '../repositories/Prisma';

export function setupSocketHandlers(
  io: SocketServer,
  dosageQueue: ReturnType<typeof getDosageAgentQueue>,
  conformityQueue: ReturnType<typeof getConformityCheckerQueue>,
  productJobCreationQueue: ReturnType<typeof getProductJobCreationQueue>,
  onboardingQueue: ReturnType<typeof getOnboardingExtractionQueue>,
): void {
  const connectionManager = SocketConnectionManager.getInstance();

  io.on('connection', (socket: AuthenticatedSocket) => {
    if (!socket.userId) {
      console.error(
        `[SOCKET.IO] Unauthenticated connection attempt from ${socket.id}. Disconnecting.`,
      );
      socket.emit('error', {
        code: 'UNAUTHENTICATED',
        message: 'Authentication required',
      });
      socket.disconnect();
      return;
    }

    const userId = socket.userId;
    console.log(`[SOCKET.IO] Client connected: ${socket.id} (user: ${userId})`);

    const canConnect = connectionManager.canUserConnect(userId);
    if (!canConnect.allowed) {
      console.warn(
        `[SOCKET.IO] User ${userId} exceeded max connections. Disconnecting socket ${socket.id}`,
      );
      socket.emit('error', {
        code: 'MAX_CONNECTIONS_EXCEEDED',
        message: canConnect.reason,
      });
      socket.disconnect();
      return;
    }

    socket.on('join:job', async (jobId: string) => {
      if (connectionManager.isJobCompleted(jobId)) {
        socket.emit('error', {
          code: 'JOB_COMPLETED',
          message: 'This job is already completed. Cannot join.',
        });
        return;
      }

      try {
        let status: { state: string; data?: { userId: string } };
        let jobQueue: {
          getJobStatus(id: string): Promise<{ state: string; data?: { userId: string } }>;
        } | null = null;
        try {
          status = await dosageQueue.getJobStatus(jobId);
          jobQueue = dosageQueue;
        } catch (error) {
          const message = error instanceof Error ? error.message : '';
          if (!message.includes('not found')) {
            throw error;
          }
          try {
            status = await conformityQueue.getJobStatus(jobId);
            jobQueue = conformityQueue;
          } catch (error2) {
            const message2 = error2 instanceof Error ? error2.message : '';
            if (!message2.includes('not found')) {
              throw error2;
            }
            try {
              status = await productJobCreationQueue.getJobStatus(jobId);
              jobQueue = productJobCreationQueue;
            } catch (error3) {
              const message3 = error3 instanceof Error ? error3.message : '';
              if (!message3.includes('not found')) {
                throw error3;
              }
              status = await onboardingQueue.getJobStatus(jobId);
              jobQueue = onboardingQueue;
            }
          }
        }

        if (status.data?.userId && status.data.userId !== userId) {
          socket.emit('error', {
            code: 'FORBIDDEN',
            message: 'You do not have permission to access this job',
          });
          return;
        }

        if (status.state === 'completed' || status.state === 'failed') {
          if (jobQueue) {
            await connectionManager.scheduleJobCompletion(jobId, io, jobQueue);
          }
          socket.emit('error', {
            code: 'JOB_COMPLETED',
            message: `Job is already ${status.state}. Cannot join.`,
          });
          return;
        }

        connectionManager.registerConnection(userId, socket.id, jobId);

        const room = `job:${jobId}`;
        socket.join(room);
        console.log(`[SOCKET.IO] User ${userId} joined room ${room}`);
        socket.emit('joined:job', { jobId, room });

        DosageLoggerService.getInstance().replayEvents(jobId, socket.id);
      } catch (error) {
        console.error(`[SOCKET.IO] Error joining job ${jobId}:`, error);
        socket.emit('error', {
          code: 'JOB_NOT_FOUND',
          message: error instanceof Error ? error.message : 'Job not found',
        });
      }
    });

    socket.on('leave:job', (jobId: string) => {
      const room = `job:${jobId}`;
      socket.leave(room);
      connectionManager.removeConnection(userId, socket.id);
      console.log(`[SOCKET.IO] User ${userId} left room ${room}`);
      socket.emit('left:job', { jobId, room });
    });

    socket.on('join:chat', async (threadId: string) => {
      try {
        const chat = await prisma.chat.findUnique({
          where: { threadId },
          select: { userId: true },
        });
        if (!chat) {
          socket.emit('error', { code: 'CHAT_NOT_FOUND', message: 'Chat not found' });
          return;
        }
        if (chat.userId !== userId) {
          socket.emit('error', { code: 'FORBIDDEN', message: 'Not authorized for this chat' });
          return;
        }
        const room = `chat:${threadId}`;
        socket.join(room);
        console.log(`[SOCKET.IO] User ${userId} joined chat room ${room}`);
        socket.emit('joined:chat', { threadId, room });
      } catch (error) {
        console.error(`[SOCKET.IO] Error joining chat ${threadId}:`, error);
        socket.emit('error', { code: 'INTERNAL_ERROR', message: 'Failed to join chat' });
      }
    });

    socket.on('leave:chat', (threadId: string) => {
      const room = `chat:${threadId}`;
      socket.leave(room);
      console.log(`[SOCKET.IO] User ${userId} left chat room ${room}`);
      socket.emit('left:chat', { threadId, room });
    });

    socket.on('join:extraction', async (batchId: string) => {
      try {
        const extraction = await prisma.fileExtraction.findFirst({
          where: { batchId, userId },
          select: { id: true },
        });
        if (!extraction) {
          socket.emit('error', { code: 'FORBIDDEN', message: 'Not authorized for this batch' });
          return;
        }
        const room = `extraction:${batchId}`;
        socket.join(room);
        console.log(`[SOCKET.IO] User ${userId} joined extraction room ${room}`);
        socket.emit('joined:extraction', { batchId, room });
      } catch (error) {
        console.error(`[SOCKET.IO] Error joining extraction ${batchId}:`, error);
        socket.emit('error', { code: 'INTERNAL_ERROR', message: 'Failed to join extraction room' });
      }
    });

    socket.on('leave:extraction', (batchId: string) => {
      const room = `extraction:${batchId}`;
      socket.leave(room);
      console.log(`[SOCKET.IO] User ${userId} left extraction room ${room}`);
      socket.emit('left:extraction', { batchId, room });
    });

    socket.on('join:preclassify', async (preclassId: string) => {
      try {
        const ownerId = await getPreclassificationOwner(preclassId);
        if (ownerId !== userId) {
          socket.emit('error', {
            code: 'FORBIDDEN',
            message: 'Not authorized for this preclassification',
          });
          return;
        }
        const room = `preclassify:${preclassId}`;
        socket.join(room);
        console.log(`[SOCKET.IO] User ${userId} joined preclassify room ${room}`);
        socket.emit('joined:preclassify', { preclassId, room });
      } catch (error) {
        console.error(`[SOCKET.IO] Error joining preclassify ${preclassId}:`, error);
        socket.emit('error', {
          code: 'INTERNAL_ERROR',
          message: 'Failed to join preclassify room',
        });
      }
    });

    socket.on('leave:preclassify', (preclassId: string) => {
      const room = `preclassify:${preclassId}`;
      socket.leave(room);
      socket.emit('left:preclassify', { preclassId, room });
    });

    socket.on('disconnect', () => {
      console.log(`[SOCKET.IO] Client disconnected: ${socket.id}`);
      connectionManager.removeSocketConnections(socket.id);
    });
  });

  connectionManager.cleanupOrphanedConnections(io);
}
