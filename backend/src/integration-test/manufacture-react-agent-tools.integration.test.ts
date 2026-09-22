/**
 * Integration tests for the manufacturing agent's tools + CompanyKind authorization
 * (Phase 4). These invoke the tools DIRECTLY against a real DB (Postgres locale) —
 * NO LLM — so they are deterministic and fast (FAST bucket). They complement the
 * real-LLM smoke in `manufacture-react-agent.integration.test.ts`.
 *
 * Covered:
 *  - list_user_companies with a MANUFACTURING kind filter → only mfg companies
 *  - list_company_products / search_company_stock_products → real seeded stock
 *  - import_stock_from_file kind guard → rejects an agricultural company
 *
 * Per eseguire:
 *   npm run test:int:fast -- --testPathPattern manufacture-react-agent-tools
 */
import { randomUUID } from 'crypto';
import { CompanyKind } from '@prisma/client';
import { createListUserCompaniesTool } from '../infrastructure/services/agents/dosage_agent_react/tools/list-user-companies.tool';
import { createListCompanyProductsTool } from '../infrastructure/services/agents/dosage_agent_react/tools/list-company-products.tool';
import { createSearchCompanyStockTool } from '../infrastructure/services/agents/dosage_agent_react/tools/stock/search-company-stock.tool';
import { createImportStockFromFileTool } from '../infrastructure/services/agents/dosage_agent_react/tools/import-stock-from-file.tool';
import {
  clearWorkingMemory,
  updateWorkingMemory,
} from '../infrastructure/services/agents/dosage_agent_react/working-memory';
import { createTestUser, createTestCompany, deleteTestCompany, prisma } from './helpers';

jest.setTimeout(60000);

const MFG_PRODUCT_NAME = 'Cartone Imballo 60x40';

describe('Manufacture agent tools — direct (real DB, no LLM)', () => {
  const threadId = `mfg-tools-${randomUUID()}`;
  let userId: string;
  let mfgCompanyId: string;
  let mfgCompanyName: string;
  let agriCompanyId: string;

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;

    mfgCompanyName = `Manifattura Test ${Date.now()}`;
    const mfg = await createTestCompany({ userId, name: mfgCompanyName });
    mfgCompanyId = mfg.id;
    // Set kind directly: the tools read `company.kind` via findManyByUserId,
    // independent of the workspace-homogeneity path in CreateCompanyUseCase.
    await prisma.company.update({
      where: { id: mfgCompanyId },
      data: { kind: CompanyKind.MANUFACTURING },
    });

    const agri = await createTestCompany({ userId, name: `Agricola Test ${Date.now()}` });
    agriCompanyId = agri.id; // stays AGRICULTURAL (default)

    // Seed one manufacturing product with positive stock.
    const warehouse = await prisma.warehouse.create({
      data: {
        companyId: mfgCompanyId,
        name: 'Magazzino Mfg',
        address: 'Via Test 1',
        sezione: 'A',
        foglio: '1',
        particella: '1',
      },
    });
    const product = await prisma.product.create({
      data: {
        name: MFG_PRODUCT_NAME,
        sku: `PKG-${Date.now()}`,
        category: 'PACKAGING',
        type: 'IMBALLAGGIO',
        warehouseId: warehouse.id,
      },
    });
    await prisma.stock.create({
      data: {
        productId: product.id,
        quantity: 120,
        unitOfMeasureQuantity: 'pz',
        price: 0,
        unitOfMeasurePrice: 'pz',
        type: 'IN',
      },
    });
  });

  afterAll(async () => {
    clearWorkingMemory(threadId);
    // deleteTestCompany cascades warehouse/product/stock cleanup. Keep the shared user.
    if (mfgCompanyId) await deleteTestCompany(mfgCompanyId);
    if (agriCompanyId) await deleteTestCompany(agriCompanyId);
  });

  it('list_user_companies with MANUFACTURING filter returns only manufacturing companies', async () => {
    const tool = createListUserCompaniesTool(userId, CompanyKind.MANUFACTURING);
    const parsed = JSON.parse((await tool.func({})) as string) as {
      companies: Array<{ id: string; name: string }>;
    };
    const ids = parsed.companies.map((c) => c.id);
    expect(ids).toContain(mfgCompanyId);
    expect(ids).not.toContain(agriCompanyId);
  });

  it('list_company_products returns the seeded manufacturing stock', async () => {
    const tool = createListCompanyProductsTool(threadId, userId);
    const parsed = JSON.parse((await tool.func({ companyId: mfgCompanyId })) as string) as {
      productsFound: number;
      workingMemoryKey: string;
      productIndex: Array<{ name: string; stock: string }>;
    };
    expect(parsed.productsFound).toBeGreaterThanOrEqual(1);
    expect(parsed.workingMemoryKey).toBe('inputProducts');
    expect(parsed.productIndex.map((p) => p.name)).toContain(MFG_PRODUCT_NAME);
  });

  it('search_company_stock_products (markdown) includes the seeded product', async () => {
    const tool = createSearchCompanyStockTool(userId);
    const result = (await tool.func({ companyName: mfgCompanyName })) as string;
    expect(result).toContain(MFG_PRODUCT_NAME);
  });

  it('import_stock_from_file kind guard rejects an agricultural company', async () => {
    // Pass the prerequisite so the kind guard (checked next) is the failing point.
    updateWorkingMemory(threadId, {
      extractedStockData: [
        {
          name: 'placeholder',
          category: 'OTHER',
          registrationNumber: null,
          stock: {
            quantity: 1,
            unitOfMeasureQuantity: 'pz',
            price: 0,
            type: 'IN',
            ddtCode: '',
            ddtDate: '',
            invoiceCode: null,
            companySupplierName: null,
          },
        },
      ],
    });
    const tool = createImportStockFromFileTool(threadId, userId, CompanyKind.MANUFACTURING);
    const parsed = JSON.parse((await tool.func({ companyId: agriCompanyId })) as string) as {
      error?: string;
    };
    expect(parsed.error).toBeDefined();
    expect(String(parsed.error)).toContain('MANUFACTURING');
  });
});
