import type { FieldNoteAgentControllerContext } from './field-note-agent-controller.context';

export function fieldNoteAgentControllerParseTemperature(this: FieldNoteAgentControllerContext, temperature: number | string | undefined): number | undefined {
    if (temperature === undefined || temperature === null) {
      return undefined;
    }
    if (typeof temperature === 'number') {
      return temperature;
    }
    const parsed = Number(temperature);
    if (Number.isNaN(parsed)) {
      return undefined;
    }
    return parsed;
  }
