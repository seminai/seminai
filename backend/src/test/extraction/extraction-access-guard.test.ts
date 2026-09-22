import { ExtractionAccessGuard } from '../../application/use-cases/extraction/ExtractionAccessGuard';
import { type Company } from '../../domain/entities/Company';
import { type ICompanyRepository } from '../../domain/repositories/ICompanyRepository';
import { type FileExtractionRecord } from '../../domain/repositories/IFileExtractionRepository';

describe('ExtractionAccessGuard', () => {
  it('allows the owner of the extraction', async () => {
    const guard = new ExtractionAccessGuard(createCompanyRepository([]));
    await expect(
      guard.assertCanAccess({
        userId: 'user-1',
        extraction: createExtraction({ userId: 'user-1', companyId: 'company-a' }),
      }),
    ).resolves.toBeUndefined();
  });

  it('allows a user belonging to the extraction company', async () => {
    const guard = new ExtractionAccessGuard(createCompanyRepository(['company-a']));
    await expect(
      guard.assertCanAccess({
        userId: 'user-2',
        extraction: createExtraction({ userId: 'user-1', companyId: 'company-a' }),
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects access to another company extraction', async () => {
    const guard = new ExtractionAccessGuard(createCompanyRepository(['company-a']));
    await expect(
      guard.assertCanAccess({
        userId: 'user-2',
        extraction: createExtraction({ userId: 'user-1', companyId: 'company-b' }),
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'EXTRACTION_ACCESS_DENIED' });
  });

  it('rejects a batch containing forbidden records', async () => {
    const guard = new ExtractionAccessGuard(createCompanyRepository(['company-a']));
    await expect(
      guard.assertCanAccessBatch({
        userId: 'user-2',
        extractions: [
          createExtraction({ userId: 'user-1', companyId: 'company-a' }),
          createExtraction({ userId: 'user-1', companyId: 'company-b' }),
        ],
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'BATCH_ACCESS_DENIED' });
  });
});

function createCompanyRepository(companyIds: readonly string[]): ICompanyRepository {
  const companies = companyIds.map((id) => ({ id }) as Company);
  return {
    create: async (company) => company,
    createMany: async () => undefined,
    findById: async () => null,
    findManyByUserId: async () => companies,
    findByVatNumber: async () => null,
    findByFiscalCode: async () => null,
    update: async (_id, company) => company as Company,
    updateMany: async () => 0,
    delete: async () => undefined,
    deleteWithAllData: async () => undefined,
    getCourierEmail: async () => null,
    setCourierEmail: async () => undefined,
  };
}

function createExtraction(input: {
  readonly userId: string;
  readonly companyId: string;
}): FileExtractionRecord {
  return {
    id: 'extraction-1',
    batchId: 'batch-1',
    status: 'PENDING_CONFIRMATION',
    category: 'invoice',
    progress: 100,
    extractedData: null,
    error: null,
    fileName: 'invoice.pdf',
    fileIndex: 0,
    fileId: 'file-1',
    fileUrl: 'file:///tmp/invoice.pdf',
    companyId: input.companyId,
    userId: input.userId,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
  };
}
