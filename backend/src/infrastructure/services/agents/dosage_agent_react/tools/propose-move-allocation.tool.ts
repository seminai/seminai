/**
 * Tool: propose_move_allocation
 * Proposes moving a field allocation from one draft Production Unit to another
 * in an embedded form-editor chat. Non-persistent: emits a `form_patch` event.
 * Equivalent to the Kanban drag&drop "move parcella" action, but via chat.
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { createChatEmitter } from '../socket/chat-socket-emitter';

export function createProposeMoveAllocationTool(threadId: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'propose_move_allocation',
    description: `Sposta una parcella (allocazione di campo) da una Unità Produttiva (UP) a un'altra nel form a sinistra.
Tutti gli indici sono 0-based. toAllocationIndex è opzionale: se omesso, la parcella viene aggiunta in fondo alla UP di destinazione.
Non scrive nel database.`,
    schema: z.object({
      fromUnitIndex: z.number().int().min(0).describe('Indice 0-based della UP sorgente'),
      allocationIndex: z
        .number()
        .int()
        .min(0)
        .describe('Indice 0-based della parcella nella UP sorgente'),
      toUnitIndex: z.number().int().min(0).describe('Indice 0-based della UP destinazione'),
      toAllocationIndex: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Posizione 0-based nella UP destinazione (opzionale, default: in fondo)'),
    }),
    func: async ({ fromUnitIndex, allocationIndex, toUnitIndex, toAllocationIndex }) => {
      const emitter = createChatEmitter(threadId);
      emitter?.emitFormPatch({
        action: 'move_allocation',
        fromUnitIndex,
        allocationIndex,
        toUnitIndex,
        toAllocationIndex,
      });
      return JSON.stringify({
        success: true,
        message: `Spostamento allocazione UP ${fromUnitIndex}#${allocationIndex} → UP ${toUnitIndex} proposto.`,
      });
    },
  });
}
