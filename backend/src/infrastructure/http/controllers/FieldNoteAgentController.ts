import { Request, Response } from 'express';
import { MulterFile } from '../../services/Multer';
import type { FieldNoteAgentControllerContext } from './field-note-agent-controller.context';
import { fieldNoteAgentControllerStream } from './field-note-agent-controller.01-stream';
import { fieldNoteAgentControllerMessage } from './field-note-agent-controller.02-message';
import { fieldNoteAgentControllerApprove } from './field-note-agent-controller.03-approve';
import { fieldNoteAgentControllerReject } from './field-note-agent-controller.04-reject';
import { fieldNoteAgentControllerGetState } from './field-note-agent-controller.05-get-state';
import { fieldNoteAgentControllerParseTemperature } from './field-note-agent-controller.06-parse-temperature';
import { fieldNoteAgentControllerBuildAgentMessage } from './field-note-agent-controller.07-build-agent-message';
import { fieldNoteAgentControllerUploadAgentFile } from './field-note-agent-controller.08-upload-agent-file';
import { fieldNoteAgentControllerExtractAttachmentContext } from './field-note-agent-controller.09-extract-attachment-context';
import { fieldNoteAgentControllerLimitText } from './field-note-agent-controller.10-limit-text';
import { FIELD_NOTE_AGENT_UPLOAD_PATH } from './field-note-agent.constants';


/**
 * Controller for field note agent operations.
 * Handles streaming chat, approvals, and state management.
 */
export class FieldNoteAgentController {

  static readonly AGENT_UPLOAD_PATH = FIELD_NOTE_AGENT_UPLOAD_PATH;

  /**
   * Stream chat response from the field note agent.
   * POST /field-note-agent/stream
   */
  async stream(req: Request, res: Response): Promise<void> {
    return fieldNoteAgentControllerStream.call(this as unknown as FieldNoteAgentControllerContext, req, res);
  }

  /**
   * Handle non-streaming chat message.
   * POST /field-note-agent/message
   */
  async message(req: Request, res: Response): Promise<void> {
    return fieldNoteAgentControllerMessage.call(this as unknown as FieldNoteAgentControllerContext, req, res);
  }

  /**
   * Approve pending tool execution.
   * POST /field-note-agent/approve
   */
  async approve(req: Request, res: Response): Promise<Response> {
    return fieldNoteAgentControllerApprove.call(this as unknown as FieldNoteAgentControllerContext, req, res);
  }

  /**
   * Reject pending tool execution.
   * POST /field-note-agent/reject
   */
  async reject(req: Request, res: Response): Promise<Response> {
    return fieldNoteAgentControllerReject.call(this as unknown as FieldNoteAgentControllerContext, req, res);
  }

  /**
   * Get conversation state for a thread.
   * GET /field-note-agent/state/:threadId
   */
  async getState(req: Request, res: Response): Promise<Response> {
    return fieldNoteAgentControllerGetState.call(this as unknown as FieldNoteAgentControllerContext, req, res);
  }

  parseTemperature(temperature: number | string | undefined): number | undefined {
    return fieldNoteAgentControllerParseTemperature.call(this as unknown as FieldNoteAgentControllerContext, temperature);
  }

  async buildAgentMessage(req: Request, message: string | undefined): Promise<string> {
    return fieldNoteAgentControllerBuildAgentMessage.call(this as unknown as FieldNoteAgentControllerContext, req, message);
  }

  async uploadAgentFile(userId: string, file: MulterFile, type?: string): Promise<string> {
    return fieldNoteAgentControllerUploadAgentFile.call(this as unknown as FieldNoteAgentControllerContext, userId, file, type);
  }

  async extractAttachmentContext(
    fileUrl: string,
    fileType: string,
  ): Promise<string | null> {
    return fieldNoteAgentControllerExtractAttachmentContext.call(this as unknown as FieldNoteAgentControllerContext, fileUrl, fileType);
  }

  limitText(text: string, maxLength: number): string {
    return fieldNoteAgentControllerLimitText.call(this as unknown as FieldNoteAgentControllerContext, text, maxLength);
  }
}
