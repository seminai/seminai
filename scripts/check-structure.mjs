import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

const ROOT = path.resolve(import.meta.dirname, '..');
const MAX_LINES = 300;
const ROOT_FILES = [
  'README.md',
  'ROADMAP.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'COMMERCIAL-LICENSE.md',
  'DCO.md',
  'NOTICE',
];
const SCAN_ROOTS = ['backend/src', 'backend/docs', 'frontend/src', 'packages', 'evals', 'loadtest', 'scripts'];
const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);
const DOCUMENT_EXTENSIONS = new Set(['.md']);
const IGNORED_DIRECTORIES = new Set([
  '.git',
  'coverage',
  'dist',
  'generated',
  'node_modules',
  'test-results',
]);
const IGNORED_FILES = new Set(['routeTree.gen.ts']);

function walk(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) return [];
  const stat = fs.statSync(absolutePath);
  if (stat.isFile()) return [absolutePath];

  return fs.readdirSync(absolutePath, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) return [];
    return walk(path.join(relativePath, entry.name));
  });
}

function isScannable(filePath) {
  if (IGNORED_FILES.has(path.basename(filePath))) return false;
  const extension = path.extname(filePath);
  return CODE_EXTENSIONS.has(extension) || DOCUMENT_EXTENSIONS.has(extension);
}

function findExplicitAny(filePath, sourceText) {
  if (!CODE_EXTENSIONS.has(path.extname(filePath))) return [];
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const findings = [];

  function visit(node) {
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      findings.push(position.line + 1);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return findings;
}

const files = [...ROOT_FILES.flatMap(walk), ...SCAN_ROOTS.flatMap(walk)]
  .filter(isScannable)
  .filter((filePath, index, all) => all.indexOf(filePath) === index)
  .sort();
const oversized = [];
const explicitAny = [];

for (const filePath of files) {
  const sourceText = fs.readFileSync(filePath, 'utf8');
  const relativePath = path.relative(ROOT, filePath);
  const splitLines = sourceText.split(/\r?\n/);
  const lineCount =
    sourceText === '' ? 0 : splitLines.length - (sourceText.endsWith('\n') ? 1 : 0);
  if (lineCount > MAX_LINES) oversized.push({ relativePath, lineCount });
  for (const line of findExplicitAny(filePath, sourceText)) {
    explicitAny.push({ relativePath, line });
  }
}

for (const finding of oversized) {
  console.error(`max-lines: ${finding.relativePath}:${finding.lineCount} (limit ${MAX_LINES})`);
}
for (const finding of explicitAny) {
  console.error(`explicit-any: ${finding.relativePath}:${finding.line}`);
}

if (oversized.length > 0 || explicitAny.length > 0) {
  console.error(
    `Structural compliance failed: ${oversized.length} oversized files, ${explicitAny.length} explicit any types.`,
  );
  process.exitCode = 1;
} else {
  console.log(`Structural compliance passed for ${files.length} files.`);
}
