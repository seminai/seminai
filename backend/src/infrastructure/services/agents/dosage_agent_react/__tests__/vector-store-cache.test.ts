import {
  VectorStoreCache,
  fingerprintCatalog,
  fingerprintOperations,
} from '../search-tools/vector-store-cache';
import type { JobWithAssignmentWithoutHistoryDTO } from '../../../../../domain/dtos/job-assignment.dto';
import type { DisciplinareEntry } from '../../chat_dosage_agent/rag';

function makeOperation(id: string, updatedAt: Date): JobWithAssignmentWithoutHistoryDTO {
  return {
    job: { id, updatedAt } as JobWithAssignmentWithoutHistoryDTO['job'],
    productionUnit: { id: 'up-1', name: 'PU', cropName: 'Vite', cropType: 'V', sauHa: 1 },
    products: [],
    fields: [],
    company: { id: 'c-1', name: 'C' },
    machine: null,
  };
}

describe('VectorStoreCache', () => {
  it('returns null on miss and stored value on hit', () => {
    const cache = new VectorStoreCache<string>(60_000, 10);
    expect(cache.get('k', 'fp')).toBeNull();
    cache.set('k', 'fp', 'v');
    expect(cache.get('k', 'fp')).toBe('v');
  });

  it('returns null when fingerprint mismatches (auto-invalidation)', () => {
    const cache = new VectorStoreCache<string>(60_000, 10);
    cache.set('k', 'fp-1', 'v');
    expect(cache.get('k', 'fp-2')).toBeNull();
    // The mismatched entry is dropped so a subsequent get with the original fp also misses
    expect(cache.get('k', 'fp-1')).toBeNull();
  });

  it('respects TTL', () => {
    jest.useFakeTimers();
    const cache = new VectorStoreCache<string>(1000, 10);
    cache.set('k', 'fp', 'v');
    jest.advanceTimersByTime(999);
    expect(cache.get('k', 'fp')).toBe('v');
    jest.advanceTimersByTime(2);
    expect(cache.get('k', 'fp')).toBeNull();
    jest.useRealTimers();
  });

  it('evicts least-recently-accessed when over capacity', () => {
    jest.useFakeTimers();
    const cache = new VectorStoreCache<string>(60_000, 2);
    cache.set('a', 'fp', 'va');
    jest.advanceTimersByTime(1);
    cache.set('b', 'fp', 'vb');
    jest.advanceTimersByTime(1);
    // Touch 'a' so 'b' becomes the LRU candidate
    expect(cache.get('a', 'fp')).toBe('va');
    jest.advanceTimersByTime(1);
    cache.set('c', 'fp', 'vc');
    expect(cache.size()).toBe(2);
    expect(cache.get('b', 'fp')).toBeNull();
    expect(cache.get('a', 'fp')).toBe('va');
    expect(cache.get('c', 'fp')).toBe('vc');
    jest.useRealTimers();
  });

  it('invalidate() removes the key', () => {
    const cache = new VectorStoreCache<string>(60_000, 10);
    cache.set('k', 'fp', 'v');
    cache.invalidate('k');
    expect(cache.get('k', 'fp')).toBeNull();
  });
});

describe('fingerprintOperations', () => {
  it('returns the same digest for the same operations (any order)', () => {
    const ops = [makeOperation('a', new Date(1)), makeOperation('b', new Date(2))];
    const reordered = [...ops].reverse();
    expect(fingerprintOperations(ops)).toBe(fingerprintOperations(reordered));
  });

  it('changes when an operation updatedAt changes', () => {
    const ops = [makeOperation('a', new Date(1))];
    const updated = [makeOperation('a', new Date(2))];
    expect(fingerprintOperations(ops)).not.toBe(fingerprintOperations(updated));
  });

  it('changes when an operation is added or removed', () => {
    const ops = [makeOperation('a', new Date(1))];
    const added = [...ops, makeOperation('b', new Date(1))];
    expect(fingerprintOperations(ops)).not.toBe(fingerprintOperations(added));
  });

  it('handles empty input', () => {
    expect(fingerprintOperations([])).toBe(fingerprintOperations([]));
  });
});

describe('fingerprintCatalog', () => {
  const e1: DisciplinareEntry = { title: 'Emilia-Romagna', anno: 2025, url: 'https://x/1.pdf' };
  const e2: DisciplinareEntry = { title: 'Veneto', anno: 2025, url: 'https://x/2.pdf' };

  it('is order-independent', () => {
    expect(fingerprintCatalog([e1, e2])).toBe(fingerprintCatalog([e2, e1]));
  });

  it('changes when an entry differs', () => {
    const e1b: DisciplinareEntry = { ...e1, anno: 2024 };
    expect(fingerprintCatalog([e1, e2])).not.toBe(fingerprintCatalog([e1b, e2]));
  });
});
