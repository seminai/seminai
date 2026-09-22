import 'dotenv/config';
import { PrismaClient } from '../../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { resolvePrismaPgSsl } from '../../src/infrastructure/repositories/prisma-pg-ssl';
import { PUBLIC_SKILLS_SEED } from './data/public-skills.data';

const SEMINAI_WORKSPACE_SLUG = 'seminai';
const DEFAULT_AUTHOR_EMAIL = 'contributors@seminai.local';

/**
 * Idempotent, non-destructive seed for the official Seminai marketplace skills.
 * Unlike `prisma/seed.ts`, this script never clears the database: it only
 * upserts the "seminai" publisher workspace and the 50 public skills, so it
 * is safe to run against a database that already contains real production data.
 *
 * Usage:
 *   DATABASE_URL="..." DIRECT_URL="..." npx tsx prisma/seed/seed-skills-standalone.ts
 *   AUTHOR_EMAIL="other@user.com" npx tsx prisma/seed/seed-skills-standalone.ts
 */
async function main(): Promise<void> {
  const authorEmail = process.env.AUTHOR_EMAIL ?? DEFAULT_AUTHOR_EMAIL;
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    ssl: resolvePrismaPgSsl(process.env.DATABASE_URL!),
  });
  const prisma = new PrismaClient({ adapter });

  try {
    const author = await prisma.user.findUnique({ where: { email: authorEmail } });
    if (!author) {
      throw new Error(`Author user not found: ${authorEmail}. Aborting without changes.`);
    }

    const workspace = await prisma.workspace.upsert({
      where: { slug: SEMINAI_WORKSPACE_SLUG },
      create: {
        name: 'Seminai',
        slug: SEMINAI_WORKSPACE_SLUG,
        description: 'Official Seminai marketplace publisher workspace',
        plan: 'ENTERPRISE',
      },
      update: {},
    });

    await prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: author.id } },
      create: {
        workspaceId: workspace.id,
        userId: author.id,
        role: 'OWNER',
        canManageRules: true,
        canInviteMembers: true,
      },
      update: {},
    });

    let created = 0;
    let updated = 0;
    for (const entry of PUBLIC_SKILLS_SEED) {
      const existing = await prisma.skill.findUnique({
        where: { workspaceId_slug: { workspaceId: workspace.id, slug: entry.slug } },
      });
      await prisma.skill.upsert({
        where: { workspaceId_slug: { workspaceId: workspace.id, slug: entry.slug } },
        create: {
          workspaceId: workspace.id,
          name: entry.name,
          slug: entry.slug,
          description: entry.description,
          status: 'ACTIVE',
          instructions: entry.instructions,
          isPublic: true,
          isFeatured: entry.isFeatured ?? false,
          viewCount: entry.viewCount ?? 0,
          createdById: author.id,
        },
        update: {
          name: entry.name,
          description: entry.description,
          status: 'ACTIVE',
          instructions: entry.instructions,
          isPublic: true,
          isFeatured: entry.isFeatured ?? false,
        },
      });
      if (existing) {
        updated += 1;
      } else {
        created += 1;
      }
    }

    console.log(
      `[SEED-SKILLS] Workspace "${workspace.slug}" (${workspace.id}) ready. Author: ${author.email}.`,
    );
    console.log(
      `[SEED-SKILLS] Skills created: ${created}, updated: ${updated}, total: ${PUBLIC_SKILLS_SEED.length}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[SEED-SKILLS] Failed:', error);
  process.exit(1);
});
