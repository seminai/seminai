import { describe, expect, it, vi } from 'vitest';
import { fetchSetupStatus } from './public-runtime-config';

vi.mock('@/lib/api-client', () => ({
  customFetch: vi.fn(),
}));

import { customFetch } from '@/lib/api-client';

describe('fetchSetupStatus', () => {
  it('returns the API payload', async () => {
    vi.mocked(customFetch).mockResolvedValueOnce({
      status: 'success',
      data: { completed: false },
    });
    await expect(fetchSetupStatus()).resolves.toEqual({ completed: false });
  });

  it('assumes completed when the endpoint is missing', async () => {
    vi.mocked(customFetch).mockRejectedValueOnce(new Error('not found'));
    await expect(fetchSetupStatus()).resolves.toEqual({ completed: true });
  });
});
