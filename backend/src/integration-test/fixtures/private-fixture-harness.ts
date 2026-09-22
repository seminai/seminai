import fs from 'node:fs';
import path from 'node:path';

export interface PrivateFixtureSummary {
  readonly configured: boolean;
  readonly fileCount: number;
  readonly totalBytes: number;
}

const REPOSITORY_ROOT = path.resolve(__dirname, '../../..');

function isInside(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveExternalRoot(): string | null {
  const configured = process.env.SEMINAI_FIXTURES_DIR?.trim();
  if (!configured) return null;
  if (!path.isAbsolute(configured)) {
    throw new Error('SEMINAI_FIXTURES_DIR must be an absolute path');
  }
  let root: string;
  try {
    root = fs.realpathSync(configured);
  } catch {
    throw new Error('SEMINAI_FIXTURES_DIR must reference a readable directory');
  }
  if (isInside(fs.realpathSync(REPOSITORY_ROOT), root)) {
    throw new Error('SEMINAI_FIXTURES_DIR must be outside the repository');
  }
  if (!fs.statSync(root).isDirectory()) {
    throw new Error('SEMINAI_FIXTURES_DIR must reference a readable directory');
  }
  return root;
}

function collectFileSizes(root: string, current: string, sizes: number[]): void {
  try {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const candidate = path.join(current, entry.name);
      const resolved = fs.realpathSync(candidate);
      if (!isInside(root, resolved)) {
        throw new Error('Private fixture symlinks must remain inside the configured directory');
      }
      const stat = fs.statSync(resolved);
      if (stat.isDirectory()) {
        collectFileSizes(root, resolved, sizes);
      } else if (stat.isFile()) {
        sizes.push(stat.size);
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Private fixture symlinks')) throw error;
    throw new Error('Private fixtures must be readable without exposing their metadata');
  }
}

/**
 * Inspects optional local fixtures without exposing names, paths, or contents.
 */
export function inspectPrivateFixtures(): PrivateFixtureSummary {
  const root = resolveExternalRoot();
  if (!root) return { configured: false, fileCount: 0, totalBytes: 0 };
  const sizes: number[] = [];
  collectFileSizes(root, root, sizes);
  return {
    configured: true,
    fileCount: sizes.length,
    totalBytes: sizes.reduce((total, size) => total + size, 0),
  };
}
