import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { prisma } from '../../../../repositories/Prisma';
import { PrismaFieldRepository } from '../../../../repositories/PrismaFieldRepository';
import { Field } from '../../../../../domain/entities/Field';
import { getWorkingMemory, updateWorkingMemory } from '../working-memory';
import { assertCompanyAccess } from './authorization';

interface FieldInput {
  name: string;
  foglio?: string | null;
  particella?: string | null;
  sezione?: string | null;
  subalterno?: string | null;
  superficieCatastaleMq?: number | null;
  sauHa?: number | null;
  gisHa?: number | null;
  address?: string | null;
  city?: string | null;
  region?: string | null;
  nation?: string;
  uso?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  polygon?: { type: string; coordinates: number[][][] } | null;
}

/**
 * Tool: create_fields
 * Creates agricultural fields (parcelle) in the system. REQUIRES USER APPROVAL.
 */
export function createCreateFieldsTool(threadId: string, userId: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'create_fields',
    description: `Crea campi agricoli (parcelle) nel sistema associandoli a un'azienda.
⚠️ QUESTO TOOL RICHIEDE APPROVAZIONE ESPLICITA DELL'UTENTE.
Prima di chiamare questo tool, presenta un riepilogo dei campi con:
- Nome, superficie, uso del suolo (e foglio/particella se disponibili)
Foglio e particella sono OPZIONALI (es. shapefile AGREA/Copernicus non li contengono).
Usa upsert: se un campo con gli stessi riferimenti esiste già, viene aggiornato.
Salva gli ID dei campi creati in working memory (createdFieldIds, createdFieldMap) per create_production_units.
Richiede un companyId valido — usa list_user_companies o create_company per ottenerlo.`,
    schema: z.object({
      companyId: z
        .string()
        .optional()
        .describe(
          'ID azienda proprietaria dei campi. Se omesso, usa automaticamente createdCompanyId dalla working memory (impostato da create_company).',
        ),
      fields: z
        .array(
          z.object({
            name: z
              .string()
              .describe('Nome campo (es. "Ravenna - F83 P8" o "Appezzamento 1 - GRANTURCO")'),
            foglio: z
              .string()
              .optional()
              .nullable()
              .describe('Foglio catastale (opzionale per shapefile)'),
            particella: z
              .string()
              .optional()
              .nullable()
              .describe('Particella catastale (opzionale per shapefile)'),
            sezione: z.string().optional().nullable().describe('Sezione catastale'),
            subalterno: z.string().optional().nullable().describe('Subalterno'),
            superficieCatastaleMq: z
              .number()
              .optional()
              .nullable()
              .describe('Superficie catastale in mq'),
            sauHa: z.number().optional().nullable().describe('SAU in ettari'),
            gisHa: z.number().optional().nullable().describe('Superficie GIS in ettari'),
            address: z.string().optional().nullable().describe('Indirizzo'),
            city: z.string().optional().nullable().describe('Comune'),
            region: z.string().optional().nullable().describe('Provincia'),
            nation: z.string().optional().default('IT').describe('Nazione'),
            uso: z.string().optional().nullable().describe('Uso del suolo (es. "Vite", "Melo")'),
            latitude: z.number().optional().nullable().describe('Latitudine'),
            longitude: z.number().optional().nullable().describe('Longitudine'),
          }),
        )
        .min(1)
        .describe('Lista campi da creare'),
    }),
    func: async ({ companyId: companyIdArg, fields: fieldInputs }) => {
      try {
        const companyId =
          companyIdArg ?? (getWorkingMemory(threadId).createdCompanyId as string | undefined);
        if (!companyId) {
          return JSON.stringify({
            error: 'companyId mancante.',
            hint: 'Fornire companyId oppure eseguire prima create_company per impostare createdCompanyId in working memory.',
          });
        }
        await assertCompanyAccess(userId, companyId);
        const repo = new PrismaFieldRepository(prisma);

        const fieldEntities = (fieldInputs as FieldInput[]).map((f) =>
          Field.create({
            companyId,
            name: f.name,
            coordinates: f.latitude && f.longitude ? [f.longitude, f.latitude] : [],
            latitude: f.latitude ?? null,
            longitude: f.longitude ?? null,
            polygon: f.polygon ?? null,
            gisHa: f.gisHa ?? null,
            sauHa: f.sauHa ?? null,
            ph: null,
            nitrogen: null,
            phosphorus: null,
            potassium: null,
            calcium: null,
            magnesium: null,
            soilType: null,
            uso: f.uso ?? null,
            qualita: null,
            superficieCatastaleMq: f.superficieCatastaleMq ?? null,
            sezione: f.sezione ?? null,
            foglio: f.foglio ?? null,
            particella: f.particella ?? null,
            subalterno: f.subalterno ?? null,
            nation: f.nation ?? 'IT',
            region: f.region ?? null,
            city: f.city ?? null,
            address: f.address ?? null,
            cap: null,
            variazioneMq: null,
            inizioConduzione: null,
            fineConduzione: null,
            bufferZoneNotes: null,
          }),
        );

        const created = await repo.upsertMany(fieldEntities);

        const fieldMap: Record<string, string> = {};
        for (const field of created) {
          if (field.foglio && field.particella) {
            const key = [
              field.foglio,
              field.particella,
              field.sezione || '',
              field.subalterno || '',
            ]
              .join('_')
              .toLowerCase();
            fieldMap[key] = field.id;
          }
          fieldMap[`name_${field.name}`.toLowerCase()] = field.id;
        }

        updateWorkingMemory(threadId, {
          createdFieldIds: created.map((f) => f.id),
          createdFieldMap: fieldMap,
        });

        const summary = created.map((f) => ({
          id: f.id,
          name: f.name,
          foglio: f.foglio,
          particella: f.particella,
          sauHa: f.sauHa,
          uso: f.uso,
        }));

        return JSON.stringify({
          fieldsCreated: created.length,
          fields: summary,
          workingMemoryKeys: ['createdFieldIds', 'createdFieldMap'],
          message: `Creati/aggiornati ${created.length} campi per l'azienda ${companyId}.`,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Errore sconosciuto';
        return JSON.stringify({ error: msg });
      }
    },
  });
}
