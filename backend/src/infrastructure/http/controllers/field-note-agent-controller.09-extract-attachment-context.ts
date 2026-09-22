import { extractMarkdownWithMistralOCRFromUrl } from '../../services/ocr/mistral';
import type { FieldNoteAgentControllerContext } from './field-note-agent-controller.context';

export async function fieldNoteAgentControllerExtractAttachmentContext(this: FieldNoteAgentControllerContext, fileUrl: string, fileType: string): Promise<string | null> {
    const isSupported = fileType.startsWith('image/') || fileType === 'application/pdf';
    if (!isSupported) {
      return null;
    }
    try {
      const markdown = await extractMarkdownWithMistralOCRFromUrl(fileUrl);
      if (!markdown || markdown.trim().length === 0) {
        return null;
      }
      const snippet = this.limitText(markdown.trim(), 4000);
      return `Attachment OCR (markdown):\n${snippet}`;
    } catch {
      return null;
    }
  }
