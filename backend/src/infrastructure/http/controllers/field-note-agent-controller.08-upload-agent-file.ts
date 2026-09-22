import { FileService } from '../../services/FileService';
import { MulterFile } from '../../services/Multer';
import { FIELD_NOTE_AGENT_UPLOAD_PATH } from './field-note-agent.constants';
import type { FieldNoteAgentControllerContext } from './field-note-agent-controller.context';

export async function fieldNoteAgentControllerUploadAgentFile(this: FieldNoteAgentControllerContext, userId: string, file: MulterFile, type?: string): Promise<string> {
    const fileService = new FileService(userId);
    const resolvedType = type || file.mimetype;
    return await fileService.uploadFile(
      file,
      userId,
      FIELD_NOTE_AGENT_UPLOAD_PATH,
      resolvedType,
    );
  }
