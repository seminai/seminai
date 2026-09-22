/**
 * Tool: propose_add_unit
 * Proposes adding a new draft Production Unit in an embedded form-editor chat.
 * Non-persistent: emits a `form_patch` event so the FE inserts a new draft.
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { createChatEmitter } from '../socket/chat-socket-emitter';

export function createProposeAddUnitTool(threadId: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'propose_add_unit',
    description: `Aggiunge una nuova Unità Produttiva (UP) in bozza nel form a sinistra, opzionalmente con valori iniziali.
Non scrive nel database. I campi non forniti restano vuoti e devono essere compilati dall'utente.
Per "uso suolo primario" usa "occupazione", per "uso suolo secondario" usa "destinazioneDiUso".`,
    schema: z.object({
      unit: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          'Mappa parziale dei campi della UP. Tutti i campi sono opzionali; le chiavi sconosciute sono ignorate.',
        ),
    }),
    func: async ({ unit }) => {
      const emitter = createChatEmitter(threadId);
      emitter?.emitFormPatch({
        action: 'add_unit',
        unit: unit ?? undefined,
      });
      return JSON.stringify({
        success: true,
        message: 'Nuova UP proposta in fondo alla lista.',
      });
    },
  });
}
