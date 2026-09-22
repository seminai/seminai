import type { DocumentCategory } from '@prisma/client';
import type { ExtractionSchema, FieldDescriptor } from './types';
import { ddtSchema } from './ddt.schema';
import { fatturaSchema } from './fattura.schema';
import { disciplinareSchema } from './disciplinare.schema';
import { fascicoloAziendaleSchema } from './fascicolo-aziendale.schema';
import { magazzinoSchema } from './magazzino.schema';
import { etichettaSchema } from './etichetta.schema';
import { visuraAziendaleSchema } from './visura-aziendale.schema';
import { notaSchema } from './nota.schema';
import { pianoColturaleSchema } from './piano-colturale.schema';
import { certificazioneSchema } from './certificazione.schema';
import { altroSchema } from './altro.schema';

const REGISTRY: Readonly<Record<DocumentCategory, ExtractionSchema<unknown>>> = {
  DDT: ddtSchema,
  FATTURA: fatturaSchema,
  DISCIPLINARE: disciplinareSchema,
  FASCICOLO_AZIENDALE: fascicoloAziendaleSchema,
  MAGAZZINO: magazzinoSchema,
  ETICHETTA: etichettaSchema,
  VISURA_AZIENDALE: visuraAziendaleSchema,
  NOTA: notaSchema,
  PIANO_COLTURALE: pianoColturaleSchema,
  CERTIFICAZIONE: certificazioneSchema,
  ALTRO: altroSchema,
};

export function getExtractionSchema(category: DocumentCategory): ExtractionSchema<unknown> {
  return REGISTRY[category];
}

export function getExtractionFields(category: DocumentCategory): readonly FieldDescriptor[] {
  return REGISTRY[category].fields;
}

export type { ExtractionSchema, FieldDescriptor, FieldType } from './types';
