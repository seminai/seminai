import { Request, Response, NextFunction } from 'express';
import { gunzipSync } from 'zlib';

/**
 * Middleware to decompress request body if it was compressed by the client.
 * Supports two formats:
 * 1. Content-Encoding: gzip - Raw gzip compressed body
 * 2. X-Payload-Compressed: gzip - JSON wrapper with base64 encoded gzip data
 *    Body format: { compressed: true, data: "base64-encoded-gzip" }
 */
export function decompressRequestBody(req: Request, _res: Response, next: NextFunction): void {
  // Format 1: Content-Encoding header with raw gzip body
  const contentEncoding = req.headers['content-encoding'];
  const isContentEncodingCompressed = contentEncoding === 'gzip' || contentEncoding === 'deflate';

  if (isContentEncodingCompressed && req.body && Buffer.isBuffer(req.body)) {
    try {
      console.log('[REQUEST-DECOMPRESSION] Decompressing Content-Encoding gzip body');
      const originalSize = req.body.length;
      const decompressed = gunzipSync(req.body as unknown as Uint8Array);
      const jsonString = decompressed.toString('utf8');
      req.body = JSON.parse(jsonString);
      console.log(
        `[REQUEST-DECOMPRESSION] Decompressed from ${originalSize} bytes to ${jsonString.length} bytes`,
      );
    } catch (error) {
      console.error('[REQUEST-DECOMPRESSION] Error decompressing body:', error);
    }
    return next();
  }

  // Format 2: X-Payload-Compressed header with base64 JSON wrapper
  const xPayloadCompressed = req.headers['x-payload-compressed'];
  if (xPayloadCompressed === 'gzip' && req.body?.compressed === true && req.body?.data) {
    try {
      const originalSize = req.headers['x-original-size'];
      const compressedSize = req.headers['x-compressed-size'];
      console.log(
        `[REQUEST-DECOMPRESSION] Decompressing X-Payload-Compressed body (${compressedSize} → ${originalSize} bytes)`,
      );

      // Decode base64 to buffer
      const compressedBuffer = Buffer.from(req.body.data, 'base64');

      // Decompress gzip
      const decompressed = gunzipSync(compressedBuffer as unknown as Uint8Array);
      const jsonString = decompressed.toString('utf8');

      // Parse JSON
      req.body = JSON.parse(jsonString);

      console.log(
        `[REQUEST-DECOMPRESSION] Successfully decompressed payload (${compressedBuffer.length} → ${jsonString.length} bytes)`,
      );
    } catch (error) {
      console.error(
        '[REQUEST-DECOMPRESSION] Error decompressing X-Payload-Compressed body:',
        error,
      );
      // If decompression fails, keep original body - will likely cause downstream errors
    }
  }

  next();
}
