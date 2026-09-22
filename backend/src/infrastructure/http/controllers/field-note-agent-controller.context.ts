import { Request, Response } from 'express';
import { MulterFile } from '../../services/Multer';

export interface FieldNoteAgentControllerContext {
  stream(req: Request, res: Response): Promise<void>;
  message(req: Request, res: Response): Promise<void>;
  approve(req: Request, res: Response): Promise<Response>;
  reject(req: Request, res: Response): Promise<Response>;
  getState(req: Request, res: Response): Promise<Response>;
  parseTemperature(temperature: number | string | undefined): number | undefined;
  buildAgentMessage(req: Request, message: string | undefined): Promise<string>;
  uploadAgentFile(userId: string, file: MulterFile, type?: string): Promise<string>;
  extractAttachmentContext(fileUrl: string, fileType: string): Promise<string | null>;
  limitText(text: string, maxLength: number): string;
}
