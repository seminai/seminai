/**
 * Audit: workspace ↔ company kind consistency (pre-rollout check for Phase 7).
 *
 * A company is associated to a workspace indirectly, via Rule → RuleOnCompany.
 * Before enabling WORKSPACE_KIND_ROUTING, every company linked to a workspace
 * should share that workspace's kind. This read-only script reports:
 *   - MISMATCH: a company linked (via a rule) to a workspace of a different kind.
 *   - MIXED:    a company linked to workspaces of more than one distinct kind.
 *
 * Usage:
 *   npx tsx scripts/audit-workspace-company-kinds.ts [--out <path>] [--no-file]
 *   npm run audit:workspace-kinds
 */
import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { prisma } from '../src/infrastructure/repositories/Prisma';

interface Options {
  readonly outPath: string;
  readonly writeFile: boolean;
}

interface IssueRow {
  readonly issue: 'MISMATCH' | 'MIXED';
  readonly companyId: string;
  readonly companyName: string;
  readonly companyKind: string;
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly workspaceKind: string;
}

function parseArgs(argv: readonly string[]): Options {
  const stamp = new Date().toISOString().slice(0, 10);
  let outPath = join('reports', `workspace-company-kinds-${stamp}.csv`);
  let writeFile = true;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out' && argv[i + 1]) {
      outPath = argv[i + 1];
      i += 1;
    } else if (argv[i] === '--no-file') {
      writeFile = false;
    }
  }
  return { outPath, writeFile };
}

function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function toCsv(rows: readonly IssueRow[]): string {
  const header = [
    'issue',
    'companyId',
    'companyName',
    'companyKind',
    'workspaceId',
    'workspaceName',
    'workspaceKind',
  ].join(',');
  const lines = rows.map((r) =>
    [
      r.issue,
      r.companyId,
      csvField(r.companyName),
      r.companyKind,
      r.workspaceId,
      csvField(r.workspaceName),
      r.workspaceKind,
    ].join(','),
  );
  return [header, ...lines].join('\n');
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  const [workspaceCount, companyCount, links] = await Promise.all([
    prisma.workspace.count(),
    prisma.company.count(),
    prisma.ruleOnCompany.findMany({
      select: {
        company: { select: { id: true, name: true, kind: true } },
        rule: { select: { workspace: { select: { id: true, name: true, kind: true } } } },
      },
    }),
  ]);

  const rows: IssueRow[] = [];
  // Track, per company, the distinct workspace kinds it is linked to.
  const kindsByCompany = new Map<
    string,
    { name: string; kind: string; workspaceKinds: Set<string> }
  >();

  for (const link of links) {
    const { company } = link;
    const workspace = link.rule.workspace;
    const entry = kindsByCompany.get(company.id) ?? {
      name: company.name,
      kind: company.kind,
      workspaceKinds: new Set<string>(),
    };
    entry.workspaceKinds.add(workspace.kind);
    kindsByCompany.set(company.id, entry);

    if (company.kind !== workspace.kind) {
      rows.push({
        issue: 'MISMATCH',
        companyId: company.id,
        companyName: company.name,
        companyKind: company.kind,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        workspaceKind: workspace.kind,
      });
    }
  }

  let mixedCount = 0;
  for (const [companyId, entry] of kindsByCompany) {
    if (entry.workspaceKinds.size > 1) {
      mixedCount += 1;
      rows.push({
        issue: 'MIXED',
        companyId,
        companyName: entry.name,
        companyKind: entry.kind,
        workspaceId: '(multiple)',
        workspaceName: '(multiple)',
        workspaceKind: [...entry.workspaceKinds].sort().join('|'),
      });
    }
  }

  const mismatchCount = rows.filter((r) => r.issue === 'MISMATCH').length;

  console.log('— Workspace/Company kind audit —');
  console.log(
    `Workspaces: ${workspaceCount} · Companies: ${companyCount} · Rule→company links: ${links.length}`,
  );
  console.log(`MISMATCH (company kind ≠ workspace kind): ${mismatchCount}`);
  console.log(`MIXED (company spans multiple workspace kinds): ${mixedCount}`);

  if (rows.length === 0) {
    console.log(
      '✓ No workspace/company kind issues found — safe to enable WORKSPACE_KIND_ROUTING.',
    );
  } else {
    console.log('✗ Issues found — fix before enabling WORKSPACE_KIND_ROUTING:');
    for (const r of rows.slice(0, 20)) {
      console.log(
        `  [${r.issue}] company "${r.companyName}" (${r.companyKind}) ↔ workspace "${r.workspaceName}" (${r.workspaceKind})`,
      );
    }
    if (rows.length > 20) console.log(`  …and ${rows.length - 20} more (see CSV).`);
  }

  if (opts.writeFile) {
    mkdirSync(dirname(opts.outPath), { recursive: true });
    writeFileSync(opts.outPath, `${toCsv(rows)}\n`, 'utf-8');
    console.log(`Report written to ${opts.outPath}`);
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => undefined);
  process.exitCode = 1;
});
