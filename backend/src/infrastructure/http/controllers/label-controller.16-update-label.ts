import type { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { PrismaLabelExtractionRepository } from '../../repositories/PrismaLabelExtractionRepository';
import { prisma } from '../../repositories/Prisma';
import { PrismaLabelHistoryRepository } from '../../repositories/PrismaLabelHistoryRepository';
import { calculateLabelChanges, createLabelSnapshot } from '../../../domain/utils/labelDiff';
import { extractStructuredTreatmentData } from '../../services/tool/extractDataFromLabel';
import { LabelCategory } from '../../../domain/repositories/ILabelExtractionRepository';
import type { LabelControllerContext } from './label-controller.context';

export async function labelControllerUpdateLabel(this: LabelControllerContext, request: Request, response: Response): Promise<Response> {
    const { id } = request.params as { id?: string };
    const safeId = String(id ?? '').trim();
    if (!safeId) {
      throw AppError.badRequest('Missing id', 'MISSING_ID');
    }
    const userId = (request as { user?: { id?: string } }).user?.id;
    const repo = new PrismaLabelExtractionRepository(prisma);
    const existing = await repo.findById(safeId);
    if (!existing) {
      throw AppError.notFound('Label extraction not found', 'LABEL_NOT_FOUND');
    }
    if (!existing.rawText || existing.rawText.trim().length === 0) {
      throw AppError.badRequest('Raw text is empty or missing', 'EMPTY_RAW_TEXT');
    }
    const extractedLabel = await extractStructuredTreatmentData(existing.rawText);
    const extractedFields: string[] = [];
    if (extractedLabel.prodotto) extractedFields.push('prodotto');
    if (extractedLabel.categoria) extractedFields.push('categoria');
    if (extractedLabel.principio_attivo) extractedFields.push('principio_attivo');
    if (extractedLabel.composizione) extractedFields.push('composizione');
    if (extractedLabel.malattie.length > 0) extractedFields.push('malattie');
    if (extractedLabel.specie.length > 0) extractedFields.push('specie');
    if (extractedLabel.colture_target.length > 0) extractedFields.push('colture_target');
    if (extractedLabel.dosaggi_dettagliati.length > 0) extractedFields.push('dosaggi_dettagliati');
    const updateData = {
      label: extractedLabel,
      extractionConfidence: extractedLabel.extraction_confidence,
      extractedFields,
      errors: extractedLabel.errors,
      category: LabelCategory.FITO,
    };
    const updated = await repo.updateById(safeId, updateData);
    if (!updated) {
      throw AppError.notFound('Label extraction not found', 'LABEL_NOT_FOUND');
    }
    if (userId) {
      const historyRepo = new PrismaLabelHistoryRepository(prisma);
      const changes = calculateLabelChanges(existing, updateData);
      if (changes.length > 0) {
        const snapshot = createLabelSnapshot(existing);
        await historyRepo.create({
          labelExtractionId: safeId,
          userId,
          changes,
          previousSnapshot: snapshot,
        });
      }
    }
    return response.json({ status: 'success', data: updated });
  }
