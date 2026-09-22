import { calculateAggregatedStock } from '../stockAggregator';

describe('calculateAggregatedStock', () => {
  it('counts manual OUT movements and verified job OUT movements, but not unverified job OUT movements', async () => {
    const aggregate = jest
      .fn()
      .mockResolvedValueOnce({ _sum: { quantity: 100 } })
      .mockResolvedValueOnce({ _sum: { quantity: -25 } });
    const prisma = { stock: { aggregate } };

    const result = await calculateAggregatedStock(prisma as never, {
      productId: 'product-1',
      companyId: 'company-1',
    });

    expect(result).toEqual({
      stockInTotal: 100,
      stockOutVerifiedTotal: -25,
      availableStock: 75,
    });
    expect(aggregate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          productId: 'product-1',
          quantity: { lt: 0 },
          type: 'OUT',
          OR: [{ jobId: null }, { job: { isVerified: true } }],
          product: { warehouse: { companyId: 'company-1' } },
        }),
      }),
    );
  });
});
