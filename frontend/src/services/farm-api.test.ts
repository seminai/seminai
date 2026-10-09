import { beforeEach, expect, it, vi } from 'vitest';
import { getCompleteFarmCatalog } from './farm-api';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ customFetch: request }));
beforeEach(() => request.mockReset());

it('offers products on later catalog pages and removes overlapping records', async () => {
  const firstPage = Array.from({ length: 100 }, (_, index) => ({ id: `product-${index}` }));
  request
    .mockResolvedValueOnce({ data: firstPage })
    .mockResolvedValueOnce({ data: [firstPage[99], { id: 'product-100' }] });
  const products = await getCompleteFarmCatalog('synthetic-company', 'products');
  expect(products).toHaveLength(101);
  expect(products.at(-1)?.id).toBe('product-100');
  expect(request).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ url: expect.stringContaining('offset=100') }),
  );
});

it('reports a failed later page instead of silently showing an incomplete catalog', async () => {
  request
    .mockResolvedValueOnce({ data: Array.from({ length: 100 }, (_, id) => ({ id: String(id) })) })
    .mockRejectedValueOnce(new Error('Catalog unavailable'));
  await expect(getCompleteFarmCatalog('synthetic-company', 'production-units')).rejects.toThrow(
    'Catalog unavailable',
  );
});
