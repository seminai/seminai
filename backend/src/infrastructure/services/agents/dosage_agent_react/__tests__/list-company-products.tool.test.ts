const mockFindManyByUserId = jest.fn();

jest.mock('../../../../repositories/PrismaProductRepository', () => ({
  PrismaProductRepository: jest.fn().mockImplementation(() => ({
    findManyByUserId: mockFindManyByUserId,
  })),
}));

jest.mock('../../../../repositories/Prisma', () => ({
  prisma: {},
}));

import { createListCompanyProductsTool } from '../tools/list-company-products.tool';
import { clearWorkingMemory, getWorkingMemory, updateWorkingMemory } from '../working-memory';

const COMPANY_1 = '00000000-0000-0000-0000-000000000001';
const COMPANY_2 = '00000000-0000-0000-0000-000000000002';

interface TestStock {
  readonly type: 'IN' | 'OUT' | 'CARICO' | 'SCARICO';
  readonly quantity: number;
  readonly unitOfMeasureQuantity: string;
}

interface TestProduct {
  readonly id: string;
  readonly name: string;
  readonly registrationNumber: string;
  readonly category: string;
  readonly type: string;
  readonly stocks: readonly TestStock[];
  readonly warehouse: {
    readonly name: string;
    readonly company: {
      readonly id: string;
      readonly name: string;
    };
  };
}

function buildProduct(
  index: number,
  companyId = '00000000-0000-0000-0000-000000000001',
): TestProduct {
  return {
    id: `p-${index}`,
    name: `Product ${index}`,
    registrationNumber: `REG-${index}`,
    category: 'PESTICIDE',
    type: 'FUNGICIDE',
    stocks: [
      { type: 'IN', quantity: 100 - index, unitOfMeasureQuantity: 'kg' },
      { type: 'OUT', quantity: 1, unitOfMeasureQuantity: 'kg' },
    ],
    warehouse: {
      name: 'Main warehouse',
      company: {
        id: companyId,
        name: companyId === COMPANY_1 ? 'Seminai Fruit Farm' : 'Other Company',
      },
    },
  };
}

describe('list_company_products tool', () => {
  const threadId = 'list-company-products-thread';
  const userId = 'user-1';

  beforeEach(() => {
    clearWorkingMemory(threadId);
    jest.clearAllMocks();
  });

  it('returns all products in productIndex when products with stock are more than 15', async () => {
    const products = Array.from({ length: 20 }, (_, i) => buildProduct(i + 1));
    mockFindManyByUserId.mockResolvedValue(products);
    const tool = createListCompanyProductsTool(threadId, userId);

    const result = JSON.parse(await tool.func({}));

    expect(result.productsFound).toBe(20);
    expect(result.productsWithStock).toBe(20);
    expect(result.productIndex).toHaveLength(20);
    expect(result.productIndex[0]).toMatchObject({
      idx: 0,
      name: 'Product 1',
      registrationNumber: 'REG-1',
    });
    expect(result.productIndex[19]).toMatchObject({
      idx: 19,
      name: 'Product 20',
      registrationNumber: 'REG-20',
    });

    const memory = getWorkingMemory(threadId).inputProducts as Array<{ productName: string }>;
    expect(memory).toHaveLength(20);
    expect(memory[0]?.productName).toBe('Product 1');
  });

  it('applies companyId filter and stores only products with positive stock in working memory', async () => {
    const matchingCompanyPositive = buildProduct(1, COMPANY_1);
    const matchingCompanyNoStock: TestProduct = {
      ...buildProduct(2, COMPANY_1),
      stocks: [{ type: 'OUT', quantity: 10, unitOfMeasureQuantity: 'kg' }],
    };
    const otherCompanyPositive = buildProduct(3, COMPANY_2);
    mockFindManyByUserId.mockResolvedValue([
      matchingCompanyPositive,
      matchingCompanyNoStock,
      otherCompanyPositive,
    ]);
    const tool = createListCompanyProductsTool(threadId, userId);

    const result = JSON.parse(await tool.func({ companyId: COMPANY_1 }));

    expect(result.productsFound).toBe(2);
    expect(result.productsWithStock).toBe(1);
    expect(result.productIndex).toHaveLength(1);
    expect(result.productIndex[0]).toMatchObject({
      idx: 0,
      name: 'Product 1',
      registrationNumber: 'REG-1',
    });

    const memory = getWorkingMemory(threadId).inputProducts as Array<{ productName: string }>;
    expect(memory).toHaveLength(1);
    expect(memory[0]?.productName).toBe('Product 1');
  });

  it('defaults companyId from wm.currentCompanyId when not provided in args', async () => {
    updateWorkingMemory(threadId, { currentCompanyId: COMPANY_1 });
    const onlyMatching = buildProduct(1, COMPANY_1);
    const otherCompany = buildProduct(2, COMPANY_2);
    mockFindManyByUserId.mockResolvedValue([onlyMatching, otherCompany]);
    const tool = createListCompanyProductsTool(threadId, userId);

    const result = JSON.parse(await tool.func({}));

    expect(result.productsFound).toBe(1);
    expect(result.productIndex).toHaveLength(1);
    expect(result.productIndex[0]).toMatchObject({ name: 'Product 1' });
  });

  it('explicit companyId arg overrides wm.currentCompanyId fallback', async () => {
    updateWorkingMemory(threadId, { currentCompanyId: COMPANY_1 });
    mockFindManyByUserId.mockResolvedValue([
      buildProduct(1, COMPANY_1),
      buildProduct(3, COMPANY_2),
    ]);
    const tool = createListCompanyProductsTool(threadId, userId);

    const result = JSON.parse(await tool.func({ companyId: COMPANY_2 }));

    expect(result.productsFound).toBe(1);
    expect(result.productIndex[0]).toMatchObject({ name: 'Product 3' });
  });

  it('exposes registrationNumber for every entry in productIndex', async () => {
    const products = [
      { ...buildProduct(1), registrationNumber: '11890' },
      { ...buildProduct(2), registrationNumber: '15549' },
      { ...buildProduct(3), registrationNumber: '13567' },
    ];
    mockFindManyByUserId.mockResolvedValue(products);
    const tool = createListCompanyProductsTool(threadId, userId);

    const result = JSON.parse(await tool.func({}));

    expect(result.productIndex).toHaveLength(3);
    const regNumbers = (result.productIndex as Array<{ registrationNumber: string }>).map(
      (p) => p.registrationNumber,
    );
    expect(regNumbers).toEqual(expect.arrayContaining(['11890', '15549', '13567']));
    for (const entry of result.productIndex) {
      expect(typeof entry.registrationNumber).toBe('string');
      expect(entry.registrationNumber.length).toBeGreaterThan(0);
    }
  });
});
