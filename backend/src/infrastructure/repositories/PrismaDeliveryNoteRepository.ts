import { DeliveryNoteStatus, Prisma, PrismaClient } from '@prisma/client';
import { DeliveryNote } from '../../domain/entities/DeliveryNote';
import { DeliveryNoteItem } from '../../domain/entities/DeliveryNoteItem';
import {
  DeliveryNoteWithItems,
  GenerateDeliveryNoteRepoInput,
  IDeliveryNoteRepository,
} from '../../domain/repositories/IDeliveryNoteRepository';
import {
  cancelDeliveryNoteTx,
  generateDeliveryNoteTx,
  markSentDeliveryNoteTx,
} from './prisma-delivery-note-tx';

const MAX_NUMBERING_RETRIES = 3;

type DeliveryNoteWithItemsRow = Prisma.DeliveryNoteGetPayload<{ include: { items: true } }>;

function toWithItems(row: DeliveryNoteWithItemsRow): DeliveryNoteWithItems {
  return {
    deliveryNote: DeliveryNote.fromPrisma(row),
    items: row.items.map(DeliveryNoteItem.fromPrisma),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export class PrismaDeliveryNoteRepository implements IDeliveryNoteRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** Retries the atomic generation on progressive-number collisions (concurrent DDTs). */
  async generate(input: GenerateDeliveryNoteRepoInput): Promise<DeliveryNoteWithItems> {
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_NUMBERING_RETRIES; attempt += 1) {
      try {
        return await generateDeliveryNoteTx(this.prisma, input);
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        lastError = error;
      }
    }
    throw lastError;
  }

  async cancel(input: {
    deliveryNoteId: string;
    reason: string | null;
  }): Promise<DeliveryNoteWithItems> {
    return cancelDeliveryNoteTx(this.prisma, input.deliveryNoteId, input.reason);
  }

  async markSent(deliveryNoteId: string): Promise<DeliveryNoteWithItems> {
    return markSentDeliveryNoteTx(this.prisma, deliveryNoteId);
  }

  async findById(id: string): Promise<DeliveryNoteWithItems | null> {
    const row = await this.prisma.deliveryNote.findUnique({
      where: { id },
      include: { items: true },
    });
    return row ? toWithItems(row) : null;
  }

  async findManyByCompany(
    companyId: string,
    options?: { status?: DeliveryNoteStatus },
  ): Promise<DeliveryNoteWithItems[]> {
    const rows = await this.prisma.deliveryNote.findMany({
      where: { companyId, ...(options?.status ? { status: options.status } : {}) },
      include: { items: true },
      orderBy: [{ year: 'desc' }, { number: 'desc' }],
    });
    return rows.map(toWithItems);
  }

  async setHtmlUrl(id: string, htmlUrl: string): Promise<void> {
    await this.prisma.deliveryNote.update({ where: { id }, data: { htmlUrl } });
  }
}
