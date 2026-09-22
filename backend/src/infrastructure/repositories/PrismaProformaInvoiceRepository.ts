import { Prisma, PrismaClient } from '@prisma/client';
import { ProformaInvoice } from '../../domain/entities/ProformaInvoice';
import { ProformaInvoiceItem } from '../../domain/entities/ProformaInvoiceItem';
import {
  GenerateProformaInvoiceRepoInput,
  IProformaInvoiceRepository,
  ProformaInvoiceWithItems,
} from '../../domain/repositories/IProformaInvoiceRepository';
import { generateProformaInvoiceTx } from './prisma-proforma-invoice-tx';

const MAX_NUMBERING_RETRIES = 3;

type ProformaInvoiceWithItemsRow = Prisma.ProformaInvoiceGetPayload<{ include: { items: true } }>;

function toWithItems(row: ProformaInvoiceWithItemsRow): ProformaInvoiceWithItems {
  return {
    proformaInvoice: ProformaInvoice.fromPrisma(row),
    items: row.items.map(ProformaInvoiceItem.fromPrisma),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export class PrismaProformaInvoiceRepository implements IProformaInvoiceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** Retries the atomic generation on progressive-number collisions (concurrent proformas). */
  async generate(input: GenerateProformaInvoiceRepoInput): Promise<ProformaInvoiceWithItems> {
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_NUMBERING_RETRIES; attempt += 1) {
      try {
        return await generateProformaInvoiceTx(this.prisma, input);
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        lastError = error;
      }
    }
    throw lastError;
  }

  async findById(id: string): Promise<ProformaInvoiceWithItems | null> {
    const row = await this.prisma.proformaInvoice.findUnique({
      where: { id },
      include: { items: true },
    });
    return row ? toWithItems(row) : null;
  }

  async findManyByCompany(companyId: string): Promise<ProformaInvoiceWithItems[]> {
    const rows = await this.prisma.proformaInvoice.findMany({
      where: { companyId },
      include: { items: true },
      orderBy: [{ year: 'desc' }, { number: 'desc' }],
    });
    return rows.map(toWithItems);
  }

  async findOrderIdsByCompany(companyId: string): Promise<string[]> {
    const rows = await this.prisma.proformaInvoice.findMany({
      where: { companyId, orderId: { not: null } },
      select: { orderId: true },
      distinct: ['orderId'],
    });
    return rows.map((row) => row.orderId).filter((id): id is string => id !== null);
  }

  async setHtmlUrl(id: string, htmlUrl: string): Promise<void> {
    await this.prisma.proformaInvoice.update({ where: { id }, data: { htmlUrl } });
  }
}
