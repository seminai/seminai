import { describe, it, expect } from '@jest/globals';
import {
  compressIfNeeded,
  decompressIfNeeded,
  calculateSizeInMB,
} from '../infrastructure/utils/redis-compression.util';

describe('Redis Compression Utility', () => {
  describe('calculateSizeInMB', () => {
    it('should calculate size correctly for small object', () => {
      const data = { test: 'small' };
      const size = calculateSizeInMB(data);
      expect(size).toBeGreaterThan(0);
      expect(size).toBeLessThan(0.001);
    });

    it('should calculate size correctly for large object', () => {
      const largeString = 'x'.repeat(10 * 1024 * 1024);
      const data = { content: largeString };
      const size = calculateSizeInMB(data);
      expect(size).toBeGreaterThan(9);
    });
  });

  describe('compressIfNeeded', () => {
    it('should not compress small data', () => {
      const smallData = { test: 'small', value: 123 };
      const result = compressIfNeeded(smallData);
      expect(result.compressed).toBe(false);
      expect(result.data).toEqual(smallData);
    });

    it('should compress large data exceeding 8MB', () => {
      const largeString = 'a'.repeat(9 * 1024 * 1024);
      const largeData = { content: largeString };
      const result = compressIfNeeded(largeData);
      expect(result.compressed).toBe(true);
      expect(typeof result.data).toBe('string');
    });

    it.skip('should throw error if compressed data exceeds 90MB (slow test)', () => {
      const randomData: string[] = [];
      for (let i = 0; i < 50 * 1024 * 1024; i++) {
        randomData.push(Math.random().toString(36).substring(2));
      }
      const hugeData = { content: randomData.join('') };
      expect(() => compressIfNeeded(hugeData)).toThrow(/exceeds Redis record limit/);
    });

    it('should significantly reduce size when compressing repetitive data', () => {
      const repetitiveString = 'abcdefgh'.repeat(2 * 1024 * 1024);
      const data = { content: repetitiveString };
      const originalSize = calculateSizeInMB(data);
      const compressed = compressIfNeeded(data);
      expect(compressed.compressed).toBe(true);
      const compressedSize = Buffer.byteLength(compressed.data as string, 'utf8') / 1024 / 1024;
      expect(compressedSize).toBeLessThan(originalSize * 0.5);
    });
  });

  describe('decompressIfNeeded', () => {
    it('should return data as-is if not compressed', () => {
      const originalData = { test: 'value', number: 42 };
      const compressedWrapper = { compressed: false, data: originalData };
      const result = decompressIfNeeded(compressedWrapper);
      expect(result).toEqual(originalData);
    });

    it('should decompress data correctly', () => {
      const originalData = { test: 'value', nested: { array: [1, 2, 3] } };
      const compressed = compressIfNeeded(originalData);
      const decompressed = decompressIfNeeded(compressed);
      expect(decompressed).toEqual(originalData);
    });

    it('should handle large compressed data', () => {
      const largeString = 'x'.repeat(9 * 1024 * 1024);
      const originalData = { content: largeString };
      const compressed = compressIfNeeded(originalData);
      expect(compressed.compressed).toBe(true);
      const decompressed = decompressIfNeeded(compressed);
      expect(decompressed).toEqual(originalData);
    });
  });

  describe('Round-trip compression/decompression', () => {
    it('should preserve complex nested objects', () => {
      const complexData = {
        users: [
          { id: 1, name: 'Alice', roles: ['admin', 'user'] },
          { id: 2, name: 'Bob', roles: ['user'] },
        ],
        metadata: {
          timestamp: new Date().toISOString(),
          version: '1.0.0',
        },
        config: {
          nested: {
            deeply: {
              value: 'test',
            },
          },
        },
      };
      const compressed = compressIfNeeded(complexData);
      const decompressed = decompressIfNeeded(compressed);
      expect(decompressed).toEqual(complexData);
    });

    it('should preserve buffers as arrays in round-trip', () => {
      const bufferData = {
        fileName: 'test.pdf',
        pdfBuffer: { type: 'Buffer', data: [1, 2, 3, 4, 5] },
      };
      const compressed = compressIfNeeded(bufferData);
      const decompressed = decompressIfNeeded(compressed);
      expect(decompressed).toEqual(bufferData);
    });
  });
});
