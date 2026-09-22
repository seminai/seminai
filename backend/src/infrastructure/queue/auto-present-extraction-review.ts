/**
 * Auto-presentation flow that runs **directly from the BullMQ worker** after
 * a chat PDF extraction completes. It bypasses the agent ReAct loop when the
 * required inputs are already available (company resolvable from @mention or
 * single-company user), so the FE receives the review form immediately —
 * the user does NOT need to ask "fatto?".
 */
import { randomUUID } from 'node:crypto';
import { type DocumentCategory, type Prisma } from '@prisma/client';
import { prisma } from '../repositories/Prisma';
import { savePendingExtraction } from '../persistence/pending-extraction-store';
import { createChatEmitter } from '../services/agents/dosage_agent_react/socket/chat-socket-emitter';
import { getExtractionFields, getExtractionSchema } from '../../domain/extraction-schemas';
import { resolveCompanyForExtraction } from '../../application/services/extraction-company-resolver';
import {
  getWorkingMemory,
  updateWorkingMemory,
} from '../services/agents/dosage_agent_react/working-memory';
import type { MentionItem } from '../../domain/dtos/mention.dto';
import type { StockPreviewEntry } from '../services/agents/dosage_agent_react/tools/file-extraction-types';

interface AutoPresentInput {
  readonly threadId: string;
  readonly userId: string;
  readonly fileName: string;
  readonly documentCategory: DocumentCategory;
  readonly stockEntries: readonly StockPreviewEntry[];
  readonly mentions?: ReadonlyArray<{ type: string; id: string; label: string }>;
}

export interface AutoPresentResult {
  readonly presented: boolean;
  readonly reviewId?: string;
  readonly companyId?: string;
  readonly reason?: string;
}

/**
 * Returns true and presents the review form if the company can be resolved
 * deterministically. Otherwise returns false: the calling code should fall
 * back to the agent-driven flow (chat message inviting the user to confirm).
 */
export async function autoPresentExtractionReview(
  input: AutoPresentInput,
): Promise<AutoPresentResult> {
  const userCompanies = await prisma.company.findMany({
    where: { companyUsers: { some: { userId: input.userId } } },
    select: { id: true, name: true },
  });

  const mentions: MentionItem[] = (input.mentions ?? []).map((m) => ({
    type: m.type as MentionItem['type'],
    id: m.id,
    label: m.label,
  }));

  const resolution = resolveCompanyForExtraction({ mentions, userCompanies });
  if (resolution.kind !== 'mention' && resolution.kind !== 'auto') {
    return { presented: false, reason: `company-not-auto-resolvable:${resolution.kind}` };
  }

  const companyId = resolution.companyId;
  const seed = buildReviewSeed(input.stockEntries, input.documentCategory);
  const schema = getExtractionSchema(input.documentCategory);
  const parsed = schema.zodSchema.safeParse(seed);
  const data = parsed.success ? (parsed.data as Record<string, unknown>) : seed;

  const reviewId = randomUUID();
  const now = Date.now();
  const fileUrl = await uploadFileFromWorkingMemoryIfAvailable(input.threadId, input.userId);

  await savePendingExtraction({
    reviewId,
    threadId: input.threadId,
    userId: input.userId,
    companyId,
    category: input.documentCategory,
    fileName: input.fileName,
    fileUrl,
    data: data as Prisma.JsonObject,
    createdAt: now,
    updatedAt: now,
  });

  updateWorkingMemory(input.threadId, {
    pendingExtractionReview: {
      reviewId,
      category: input.documentCategory,
      fileName: input.fileName,
    },
  });

  const emitter = createChatEmitter(input.threadId);
  emitter?.emitExtractionReviewPresented({
    reviewId,
    category: input.documentCategory,
    companyId,
    fileName: input.fileName,
    fileUrl,
    fields: getExtractionFields(input.documentCategory),
    data,
  });

  return { presented: true, reviewId, companyId };
}

function buildReviewSeed(
  entries: readonly StockPreviewEntry[],
  category: DocumentCategory,
): Record<string, unknown> {
  const first = entries[0];
  if (!first) return {};
  const supplier = first.stock.companySupplierName ?? '';
  const totalLines = entries.length;
  const lines = entries.map((entry) => ({
    productName: entry.name,
    registrationNumber: entry.registrationNumber ?? undefined,
    quantity: entry.stock.quantity,
    unitOfMeasure: entry.stock.unitOfMeasureQuantity,
    unitPrice: entry.stock.price,
  }));
  if (category === 'DDT') {
    return {
      ddtNumber: first.stock.ddtCode ?? '',
      ddtDate: first.stock.ddtDate ?? '',
      supplierName: supplier,
      totalLines,
      lines,
    };
  }
  if (category === 'FATTURA') {
    return {
      invoiceNumber: first.stock.invoiceCode ?? first.stock.ddtCode ?? '',
      invoiceDate: first.stock.ddtDate ?? '',
      supplierName: supplier,
      totalLines,
      lines,
    };
  }
  return {};
}

async function uploadFileFromWorkingMemoryIfAvailable(
  threadId: string,
  userId: string,
): Promise<string | undefined> {
  const wm = getWorkingMemory(threadId);
  const buffer = wm.uploadedFileBuffer as Buffer | undefined;
  if (!buffer) return undefined;
  try {
    const { FileService } = await import('../services/FileService');
    const fileName = (wm.uploadedFileName as string | undefined) ?? 'document';
    const mimeType = (wm.uploadedFileMimeType as string | undefined) ?? 'application/pdf';
    const fileService = new FileService(userId);
    return await fileService.uploadFile(
      {
        fieldname: 'file',
        originalname: fileName,
        encoding: '7bit',
        mimetype: mimeType,
        size: buffer.length,
        buffer,
      },
      userId,
      'chat-extractions',
      mimeType,
    );
  } catch (err) {
    console.warn('[auto-present-extraction-review] GCS upload failed:', err);
    return undefined;
  }
}
