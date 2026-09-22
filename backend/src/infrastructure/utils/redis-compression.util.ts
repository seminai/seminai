import { gzipSync, gunzipSync } from 'zlib';

/**
 * Redis limits per Upstash
 * - Max request/command size: 9MB
 * - Max record size: 95MB
 */
const MAX_UNCOMPRESSED_REQUEST_SIZE = 8 * 1024 * 1024; // 8MB (safety margin)
const MAX_UNCOMPRESSED_RECORD_SIZE = 90 * 1024 * 1024; // 90MB (safety margin)

export interface CompressedData<T> {
  compressed: boolean;
  data: T | string;
}

/**
 * Comprime i dati se superano i limiti di Redis
 */
export function compressIfNeeded<T>(data: T): CompressedData<T> {
  const jsonString = JSON.stringify(data);
  const sizeInBytes = Buffer.byteLength(jsonString, 'utf8');
  console.log(`[REDIS-COMPRESSION] Data size: ${(sizeInBytes / 1024 / 1024).toFixed(2)}MB`);
  if (sizeInBytes > MAX_UNCOMPRESSED_REQUEST_SIZE) {
    console.log('[REDIS-COMPRESSION] Compressing data due to size');
    const compressed = gzipSync(jsonString);
    const compressedSize = compressed.length;
    console.log(
      `[REDIS-COMPRESSION] Compressed from ${(sizeInBytes / 1024 / 1024).toFixed(2)}MB to ${(compressedSize / 1024 / 1024).toFixed(2)}MB`,
    );
    if (compressedSize > MAX_UNCOMPRESSED_RECORD_SIZE) {
      throw new Error(
        `Compressed data size (${(compressedSize / 1024 / 1024).toFixed(2)}MB) exceeds Redis record limit (90MB)`,
      );
    }
    return {
      compressed: true,
      data: compressed.toString('base64'),
    };
  }
  return {
    compressed: false,
    data,
  };
}

/**
 * Decomprime i dati se erano stati compressi
 */
export function decompressIfNeeded<T>(compressedData: CompressedData<T>): T {
  if (!compressedData.compressed) {
    return compressedData.data as T;
  }
  console.log('[REDIS-COMPRESSION] Decompressing data');
  const compressedBuffer = Buffer.from(compressedData.data as string, 'base64');
  const decompressed = gunzipSync(new Uint8Array(compressedBuffer));
  return JSON.parse(decompressed.toString('utf8'));
}

/**
 * Calcola la dimensione di un oggetto in MB
 */
export function calculateSizeInMB(data: unknown): number {
  const jsonString = JSON.stringify(data);
  const sizeInBytes = Buffer.byteLength(jsonString, 'utf8');
  return sizeInBytes / 1024 / 1024;
}
