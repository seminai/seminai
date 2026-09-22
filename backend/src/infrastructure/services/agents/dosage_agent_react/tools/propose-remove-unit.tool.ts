/**
 * Tool: propose_remove_unit
 * Proposes removing a draft Production Unit from an embedded form-editor chat.
 * Non-persistent: emits a `form_patch` event so the FE drops the entry.
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { createChatEmitter } from '../socket/chat-socket-emitter';

export function createProposeRemoveUnitTool(threadId: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'propose_remove_unit',
    description: `Rimuove una Unità Produttiva (UP) in bozza dal form a sinistra (0-based).
Non scrive nel database. L'utente può annullare aggiungendola nuovamente.`,
    schema: z.object({
      unitIndex: z.number().int().min(0).describe('Indice 0-based della UP da rimuovere'),
    }),
    func: async ({ unitIndex }) => {
      const emitter = createChatEmitter(threadId);
      emitter?.emitFormPatch({
        action: 'remove_unit',
        unitIndex,
      });
      return JSON.stringify({
        success: true,
        unitIndex,
        message: `Rimozione UP ${unitIndex} proposta.`,
      });
    },
  });
}
