import { z } from 'zod';
import { FieldNoteCategory, Prisma } from '@prisma/client';
import { PrismaFieldNoteRepository } from '../../repositories/PrismaFieldNoteRepository';
import { CreateFieldNoteUseCase } from '../../../application/use-cases/field-note/CreateFieldNoteUseCase';
import { UpdateFieldNoteUseCase } from '../../../application/use-cases/field-note/UpdateFieldNoteUseCase';
import { PrismaClient } from '@prisma/client';
import { ConformityNotesService } from '../conformity-notes.service';
import { FieldNoteAttachment } from '../../../domain/entities/FieldNoteAttachment';
import { assertFieldAccess, assertProductionUnitAccess } from '../agents/shared/authorization';

type PrismaClientOrTransaction = PrismaClient | Prisma.TransactionClient;

/**
 * Schema for saving a field note with AI-extracted data.
 */
export const SaveFieldNoteSchema = z.object({
  rawContent: z.string().describe('The original raw text of the field note'),
  category: z
    .enum(['OPERATION', 'OBSERVATION', 'MEASUREMENT', 'HARVEST', 'MAINTENANCE', 'OTHER'])
    .describe('The category of the field note'),
  extractedData: z
    .object({
      recognizedProducts: z
        .array(
          z.object({
            name: z.string(),
            quantity: z.number().optional(),
            unit: z.string().optional(),
            productId: z.string().optional(),
          }),
        )
        .optional(),
      recognizedFields: z
        .array(
          z.object({
            name: z.string(),
            fieldId: z.string().optional(),
          }),
        )
        .optional(),
      operation: z.string().optional(),
      observations: z.array(z.string()).optional(),
    })
    .describe('The structured data extracted by AI'),
  fieldId: z.string().optional().describe('ID of the field associated with this note'),
  productionUnitId: z
    .string()
    .optional()
    .describe('ID of the production unit associated with this note'),
  productId: z.string().optional().describe('ID of the product used in this operation'),
  aiConfidenceScore: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe('Confidence score from AI classification'),
  latitude: z.number().optional().describe('GPS latitude'),
  longitude: z.number().optional().describe('GPS longitude'),
  altitude: z.number().optional().describe('GPS altitude'),
  gpsAccuracy: z.number().optional().describe('GPS accuracy in meters'),
  operationDate: z.string().optional().describe('ISO date string of when the operation occurred'),
  notes: z.string().optional().describe('Additional notes or comments'),
  treatedAreaHa: z
    .number()
    .optional()
    .describe(
      "Area effettivamente trattata in ettari (se diversa dall'area totale dell'unità produttiva)",
    ),
  attachmentUrl: z
    .string()
    .optional()
    .describe(
      "URL dell'immagine o file allegato nella chat (già caricato su cloud storage). Passa questo valore se il messaggio dell'utente contiene un 'Attachment URL'.",
    ),
  attachmentName: z.string().optional().describe('Nome del file allegato'),
  attachmentType: z
    .string()
    .optional()
    .describe("Tipo MIME del file allegato (es. 'image/jpeg', 'image/png', 'application/pdf')"),
});

export type SaveFieldNoteInput = z.infer<typeof SaveFieldNoteSchema>;

/**
 * Functional tool to save a field note to the database.
 *
 * @param userId The user ID who is creating the field note
 * @param prisma Prisma client instance or transaction client
 * @param input The field note data to save
 * @returns Success message with the created field note ID
 */
export async function saveFieldNote(
  userId: string,
  prisma: PrismaClientOrTransaction,
  input: SaveFieldNoteInput,
): Promise<{ success: boolean; fieldNoteId: string; message: string; attachmentSaved?: boolean }> {
  const repository = new PrismaFieldNoteRepository(prisma as PrismaClient);
  const createUseCase = new CreateFieldNoteUseCase(repository);
  const updateUseCase = new UpdateFieldNoteUseCase(repository);
  const conformityNotesService = new ConformityNotesService(prisma as PrismaClient);

  try {
    // Smart fieldId resolution: if fieldId not provided but extractedData has recognizedFields,
    // use the fieldId from the first recognized field.
    let resolvedFieldId = input.fieldId;
    const extractedFieldId = input.extractedData?.recognizedFields?.[0]?.fieldId;
    if (!resolvedFieldId && extractedFieldId) {
      console.log(
        `[Tool:save] Using fieldId from extractedData.recognizedFields: ${extractedFieldId}`,
      );
      resolvedFieldId = extractedFieldId;
    }

    // Fail-fast on conflict instead of silently overriding the caller-provided
    // fieldId. An LLM-extracted id that disagrees with the explicit input must
    // be disambiguated by the agent, not silently masked here.
    if (input.fieldId && extractedFieldId && input.fieldId !== extractedFieldId) {
      throw new Error(
        `Conflitto fieldId: input=${input.fieldId}, extractedData=${extractedFieldId}. Disambiguare prima di salvare.`,
      );
    }

    // Authorization gate: every resolved fieldId reaching the DB write must
    // belong to a company the caller has access to.
    if (resolvedFieldId) {
      await assertFieldAccess(userId, resolvedFieldId);
    }

    // Smart productionUnitId resolution: if not provided but we have a fieldId,
    // look up the production unit associated with that field
    let resolvedProductionUnitId = input.productionUnitId;
    if (!resolvedProductionUnitId && resolvedFieldId) {
      const fieldWithPU = await prisma.productionUnitOnField.findFirst({
        where: { fieldId: resolvedFieldId },
        select: { productionUnitId: true, productionUnit: { select: { name: true } } },
      });
      if (fieldWithPU) {
        console.log(
          `[Tool:save] Resolved productionUnitId from field: ${fieldWithPU.productionUnitId} (${fieldWithPU.productionUnit.name})`,
        );
        resolvedProductionUnitId = fieldWithPU.productionUnitId;
      }
    }

    if (resolvedProductionUnitId) {
      await assertProductionUnitAccess(userId, resolvedProductionUnitId);
    }

    const operationDate = input.operationDate ? new Date(input.operationDate) : new Date();
    console.log('[Tool:save] Building conformity notes...');
    console.log('[Tool:save] Resolved fieldId:', resolvedFieldId || '(none)');
    console.log('[Tool:save] Resolved productionUnitId:', resolvedProductionUnitId || '(none)');
    const conformityNotes = await conformityNotesService.buildConformityNotes({
      fieldId: resolvedFieldId,
      productionUnitId: resolvedProductionUnitId,
      products: (input.extractedData?.recognizedProducts ?? []).map((product) => ({
        name: product.name,
        productId: product.productId,
      })),
    });
    console.log('[Tool:save] Conformity notes result:', conformityNotes ? 'found' : 'none');

    const createdFieldNote = await createUseCase.execute(userId, {
      category: input.category as FieldNoteCategory,
      rawContent: input.rawContent,
      latitude: input.latitude,
      longitude: input.longitude,
      altitude: input.altitude,
      gpsAccuracy: input.gpsAccuracy,
      operationDate,
      metadata: {
        source: 'field_note_agent',
        aiProcessed: true,
      },
    });

    const extractedDataWithTreatedArea = {
      ...input.extractedData,
      ...(input.treatedAreaHa !== undefined && { treatedAreaHa: input.treatedAreaHa }),
    };

    await updateUseCase.execute(createdFieldNote.id, userId, {
      status: 'PROCESSED',
      extractedData: extractedDataWithTreatedArea as Record<string, unknown>,
      fieldId: resolvedFieldId || null, // Use resolved fieldId
      productionUnitId: resolvedProductionUnitId || null, // Use resolved productionUnitId
      productId: input.productId || null,
      aiConfidenceScore: input.aiConfidenceScore,
      notes: input.notes,
      conformityNotes: conformityNotes as
        | Record<string, unknown>
        | Array<Record<string, unknown>>
        | undefined,
    });

    // Create attachment if an image/file URL was provided from the chat
    if (input.attachmentUrl) {
      console.log('[Tool:save] Creating attachment for field note:', input.attachmentUrl);
      const attachment = FieldNoteAttachment.create({
        fieldNoteId: createdFieldNote.id,
        fileUrl: input.attachmentUrl,
        fileName: input.attachmentName ?? 'attachment',
        fileType: input.attachmentType ?? 'image/jpeg',
        fileSize: 0,
        thumbnailUrl: null,
        metadata: null,
        aiAnalysis: null,
      });
      await repository.addAttachment(attachment);
      console.log('[Tool:save] Attachment created successfully');
    }

    return {
      success: true,
      fieldNoteId: createdFieldNote.id,
      message: `Field note saved successfully with ID: ${createdFieldNote.id}`,
      attachmentSaved: !!input.attachmentUrl,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to save field note: ${errorMessage}`);
  }
}
