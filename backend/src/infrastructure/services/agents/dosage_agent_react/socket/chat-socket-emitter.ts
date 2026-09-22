import type { Server as SocketServer } from 'socket.io';
import type { DocumentCategory } from '@prisma/client';
import type { ExtractionReviewPayload, FormPatchPayload, StreamEvent } from '../type/events';

export interface ExtractionCompleteMeta {
  readonly documentCategory?: DocumentCategory;
}

/**
 * Maps SSE event types to Socket.IO event names.
 * Token events are excluded (too frequent for WebSocket broadcast).
 */
const SSE_TO_SOCKET_MAP: Partial<Record<StreamEvent['type'], string>> = {
  tool_call: 'agent:tool_call',
  loop_warning: 'agent:loop_warning',
  requires_approval: 'agent:requires_approval',
  complete: 'agent:complete',
  error: 'agent:error',
  cancelled: 'agent:cancelled',
  working_memory_update: 'agent:memory_update',
  plan_step_executed: 'agent:plan_step',
  plan_presented: 'agent:plan_presented',
  questionnaire_presented: 'agent:questionnaire',
  model_selected: 'agent:model_selected',
  pipeline_progress: 'agent:pipeline_progress',
  follow_up_suggestions: 'agent:follow_up_suggestions',
};

/**
 * Emits agent events to the Socket.IO chat room for a thread.
 * Complements the SSE stream with real-time updates for UI panels
 * (thinking indicator, working memory panel, task progress).
 */
export class ChatSocketEmitter {
  private readonly room: string;
  private readonly threadId: string;

  constructor(
    private readonly io: SocketServer,
    threadId: string,
  ) {
    this.threadId = threadId;
    this.room = `chat:${threadId}`;
  }

  /**
   * Emits a stream event to the chat room if it has a Socket.IO mapping.
   * Token events are intentionally skipped (sent only via SSE).
   */
  emitStreamEvent(event: StreamEvent): void {
    const socketEvent = SSE_TO_SOCKET_MAP[event.type];
    if (!socketEvent) return;

    const payload = this.buildPayload(event);
    this.io.to(this.room).emit(socketEvent, payload);
  }

  /**
   * Emits the raw stream event under the unified `agent:event` channel along
   * with its persisted `seq` and the originating `threadId`. Allows clients
   * to subscribe to a single channel and reconcile catch-up REST responses
   * with live events by seq number.
   */
  emitStreamEventRaw(event: StreamEvent, seq: number): void {
    this.io.to(this.room).emit('agent:event', { event, seq, threadId: this.threadId });
  }

  /**
   * Emits a task plan update to the chat room.
   */
  emitTaskUpdate(taskList: readonly { id: string; content: string; status: string }[]): void {
    this.io.to(this.room).emit('agent:task_update', { taskList });
  }

  /**
   * Emits a working memory key update to the chat room.
   */
  emitMemoryUpdate(key: string, preview: string): void {
    this.io.to(this.room).emit('agent:memory_update', {
      key,
      preview: preview.slice(0, 500),
      timestamp: Date.now(),
    });
  }

  /**
   * Emits a sub-agent progress event.
   */
  emitSubagentProgress(subAgentId: string, progress: number, step: string): void {
    this.io.to(this.room).emit('agent:subagent_progress', {
      subAgentId,
      progress,
      step,
      timestamp: Date.now(),
    });
  }

  /**
   * Emits extraction progress so the frontend can show an inline progress bar.
   */
  emitExtractionProgress(jobId: string, progress: number, step: string): void {
    this.io.to(this.room).emit('agent:extraction_progress', {
      jobId,
      progress,
      step,
      timestamp: Date.now(),
    });
  }

  /**
   * Emits an extraction-complete event so the frontend can trigger a follow-up.
   */
  emitExtractionComplete(jobId: string, summary: string, meta?: ExtractionCompleteMeta): void {
    this.io.to(this.room).emit('agent:extraction_complete', {
      threadId: this.threadId,
      jobId,
      summary,
      documentCategory: meta?.documentCategory,
      timestamp: Date.now(),
    });
  }

  /**
   * Emits an extraction-failed event so the frontend can show an error.
   */
  emitExtractionFailed(jobId: string, error: string): void {
    this.io.to(this.room).emit('agent:extraction_failed', {
      threadId: this.threadId,
      jobId,
      error,
      timestamp: Date.now(),
    });
  }

  /**
   * Emits an extraction review form (Fase 3): the FE renders a per-category
   * editable form with FieldDescriptor metadata.
   */
  emitExtractionReviewPresented(payload: ExtractionReviewPayload): void {
    this.io.to(this.room).emit('agent:extraction_review_presented', {
      ...payload,
      threadId: this.threadId,
      timestamp: Date.now(),
    });
  }

  /**
   * Emits notification that an extraction review form was saved by the user.
   */
  emitExtractionReviewSaved(reviewId: string, data: Record<string, unknown>): void {
    this.io.to(this.room).emit('agent:extraction_review_saved', {
      threadId: this.threadId,
      reviewId,
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Emits notification that an extraction review form was cancelled by the user.
   */
  emitExtractionReviewCancelled(reviewId: string): void {
    this.io.to(this.room).emit('agent:extraction_review_cancelled', {
      threadId: this.threadId,
      reviewId,
      timestamp: Date.now(),
    });
  }

  /**
   * Emits a form patch proposed by an in-form chat agent.
   * The FE applies the patch to local draft state (no DB write).
   */
  emitFormPatch(payload: FormPatchPayload): void {
    this.io.to(this.room).emit('agent:form_patch', {
      threadId: this.threadId,
      formPatch: payload,
      timestamp: Date.now(),
    });
  }

  /**
   * Emits notification that a chat extraction has been committed to the archive (Fase 4).
   */
  emitExtractionArchived(payload: {
    readonly reviewId: string;
    readonly extractionId: string;
    readonly archiveUrl: string;
    readonly documentCategory: DocumentCategory;
    readonly companyId: string;
    readonly fileName: string;
  }): void {
    this.io.to(this.room).emit('agent:extraction_archived', {
      ...payload,
      threadId: this.threadId,
      timestamp: Date.now(),
    });
  }

  /**
   * Emits a pipeline progress event so the frontend can show a stepper.
   */
  emitPipelineProgress(progress: {
    currentStep: number;
    totalSteps: number;
    stepName: string;
  }): void {
    this.io.to(this.room).emit('agent:pipeline_progress', {
      ...progress,
      timestamp: Date.now(),
    });
  }

  /**
   * Emits follow-up suggestions after agent completion.
   */
  emitFollowUpSuggestions(
    suggestions: ReadonlyArray<{ id: string; text: string; action: string }>,
  ): void {
    this.io.to(this.room).emit('agent:follow_up_suggestions', {
      suggestions,
      timestamp: Date.now(),
    });
  }

  /**
   * Emits an outer loop alert to the user room.
   */
  emitOuterLoopAlert(alert: {
    triggerId: string;
    type: string;
    title: string;
    payload: unknown;
  }): void {
    this.io.to(this.room).emit('agent:outer_loop_alert', {
      ...alert,
      timestamp: Date.now(),
    });
  }

  private buildPayload(event: StreamEvent): Record<string, unknown> {
    const base: Record<string, unknown> = {
      type: event.type,
      timestamp: Date.now(),
    };

    if (event.toolCall) {
      base.toolName = event.toolCall.name;
      base.args = event.toolCall.args;
      base.toolCallId = event.toolCall.id;
    }
    if (event.content) base.content = event.content;
    if (event.error) base.error = event.error;
    if (event.cost) base.cost = event.cost;
    if (event.sources) base.sources = event.sources;
    if (event.workingMemoryKey) base.key = event.workingMemoryKey;
    if (event.plan) base.plan = event.plan;
    if (event.questionnaire) base.questionnaire = event.questionnaire;
    if (event.pipelineProgress) base.pipelineProgress = event.pipelineProgress;
    if (event.followUpSuggestions) base.suggestions = event.followUpSuggestions;

    return base;
  }
}

/**
 * Global reference to the Socket.IO server instance.
 * Set during server startup and used by streaming to create emitters.
 */
let globalSocketIO: SocketServer | null = null;

/** Sets the global Socket.IO server reference. */
export function setGlobalSocketIO(io: SocketServer): void {
  globalSocketIO = io;
}

/** Gets the global Socket.IO server reference (may be null). */
export function getGlobalSocketIO(): SocketServer | null {
  return globalSocketIO;
}

/**
 * Creates a ChatSocketEmitter if Socket.IO is available, otherwise returns null.
 */
export function createChatEmitter(threadId: string): ChatSocketEmitter | null {
  const io = getGlobalSocketIO();
  if (!io) return null;
  return new ChatSocketEmitter(io, threadId);
}
