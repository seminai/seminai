import type { FieldNoteAgentControllerContext } from './field-note-agent-controller.context';

export function fieldNoteAgentControllerLimitText(this: FieldNoteAgentControllerContext, text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return `${text.slice(0, maxLength)}\n\n[TRUNCATED]`;
  }
