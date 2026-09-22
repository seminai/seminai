/**
 * Tool: propose_set_unit_fields
 * Proposes a partial update to fields of an existing draft Production Unit in
 * an embedded form-editor chat. Does NOT write to the database: emits a
 * `form_patch` event so the FE updates local draft state.
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { createChatEmitter } from '../socket/chat-socket-emitter';

const ALLOWED_FIELD_KEYS = [
  'name',
  'cropCode',
  'cropName',
  'cropType',
  'variety',
  'protocoll',
  'protectionStructure',
  'startDate',
  'floweringDate',
  'harvestingDate',
  'endDate',
  'acquaTotalePeridoL',
  'occupazione',
  'destinazioneDiUso',
] as const;

export function createProposeSetUnitFieldsTool(threadId: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'propose_set_unit_fields',
    description: `Propone la modifica di campi di un'Unità Produttiva (UP) in bozza nel form a sinistra.
Non scrive nel database: la modifica appare subito sul form e l'utente può annullarla manualmente.
Usa unitIndex 0-based per identificare la UP. Modifica solo i campi che servono.
Chiavi ammesse in fields: ${ALLOWED_FIELD_KEYS.join(', ')}.
Per "uso suolo primario" usa "occupazione", per "uso suolo secondario" usa "destinazioneDiUso".`,
    schema: z.object({
      unitIndex: z.number().int().min(0).describe('Indice 0-based della UP da modificare'),
      fields: z
        .record(z.string(), z.unknown())
        .describe('Mappa campo → nuovo valore. Solo le chiavi ammesse vengono applicate.'),
    }),
    func: async ({ unitIndex, fields }) => {
      const sanitized = sanitizeFields(fields);
      const emitter = createChatEmitter(threadId);
      emitter?.emitFormPatch({
        action: 'set_unit_fields',
        unitIndex,
        fields: sanitized,
      });
      const appliedKeys = Object.keys(sanitized);
      return JSON.stringify({
        success: true,
        unitIndex,
        appliedFields: appliedKeys,
        message:
          appliedKeys.length === 0
            ? 'Nessun campo valido da applicare.'
            : `Patch proposto su UP ${unitIndex} per ${appliedKeys.length} campi.`,
      });
    },
  });
}

function sanitizeFields(input: Record<string, unknown>): Record<string, unknown> {
  const allowed = new Set<string>(ALLOWED_FIELD_KEYS);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (allowed.has(key)) out[key] = value;
  }
  return out;
}
