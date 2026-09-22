import { Prisma, PrismaClient, Workspace, WorkspaceRole } from '../../src/generated/prisma/client';
import { PUBLIC_SKILLS_SEED } from './data/public-skills.data';

interface SkillsSeedParams {
  readonly createdById: string;
}

interface SkillsSeedContext {
  readonly workspace: Workspace;
  readonly skillsCreated: number;
}

const SEMINAI_WORKSPACE_SLUG = 'seminai';

/**
 * Seeds the official Seminai publisher workspace and its public marketplace skills.
 * The workspace acts as the implicit "publisher" for skills marked isPublic/isFeatured.
 */
export async function seedSkillsMarketplace(
  prisma: PrismaClient,
  params: SkillsSeedParams,
): Promise<SkillsSeedContext> {
  const workspace = await prisma.workspace.create({
    data: {
      name: 'Seminai',
      slug: SEMINAI_WORKSPACE_SLUG,
      description: 'Official Seminai marketplace publisher workspace',
      plan: 'ENTERPRISE',
      members: {
        create: [
          {
            userId: params.createdById,
            role: WorkspaceRole.OWNER,
            canManageRules: true,
            canInviteMembers: true,
          },
        ],
      },
    },
  });

  const skillsData: Prisma.SkillCreateManyInput[] = PUBLIC_SKILLS_SEED.map((entry) => ({
    workspaceId: workspace.id,
    name: entry.name,
    slug: entry.slug,
    description: entry.description,
    status: 'ACTIVE',
    instructions: entry.instructions,
    isPublic: true,
    isFeatured: entry.isFeatured ?? false,
    viewCount: entry.viewCount ?? 0,
    createdById: params.createdById,
  }));

  const { count } = await prisma.skill.createMany({ data: skillsData });

  return { workspace, skillsCreated: count };
}

export type { SkillsSeedContext };
