import fs from 'fs';
import os from 'os';
import path from 'path';

export function writeTempFile(buffer: Uint8Array, originalName: string): string {
  const ext = path.extname(originalName) || '.pdf';
  const tempPath = path.join(
    os.tmpdir(),
    `seminai-agent-${Date.now()}-${Math.random().toString(36).substring(7)}${ext}`,
  );
  fs.writeFileSync(tempPath, buffer);
  return tempPath;
}

export function cleanupTempFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    /* ignore cleanup errors */
  }
}
