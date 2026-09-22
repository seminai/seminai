import { PrismaClient, Prisma } from '@prisma/client';
import { RuleOnCrop } from '../../domain/entities/RuleOnCrop';
import { IRuleOnCropRepository } from '../../domain/repositories/IRuleOnCropRepository';

export class PrismaRuleOnCropRepository implements IRuleOnCropRepository {
  constructor(private prisma: PrismaClient) {}

  async create(ruleOnCrop: RuleOnCrop): Promise<RuleOnCrop> {
    const created = await this.prisma.ruleOnCrop.create({
      data: {
        id: ruleOnCrop.id,
        ruleId: ruleOnCrop.ruleId,
        cropName: ruleOnCrop.cropName,
        cropType: ruleOnCrop.cropType,
        parameters:
          ruleOnCrop.parameters === null
            ? Prisma.JsonNull
            : (ruleOnCrop.parameters as Prisma.InputJsonValue),
        createdAt: ruleOnCrop.createdAt,
      },
    });
    return RuleOnCrop.fromPrisma(created);
  }

  async findById(id: string): Promise<RuleOnCrop | null> {
    const ruleOnCrop = await this.prisma.ruleOnCrop.findUnique({
      where: { id },
    });
    if (!ruleOnCrop) return null;
    return RuleOnCrop.fromPrisma(ruleOnCrop);
  }

  async findByRuleAndCrop(ruleId: string, cropName: string): Promise<RuleOnCrop | null> {
    const ruleOnCrop = await this.prisma.ruleOnCrop.findUnique({
      where: {
        ruleId_cropName: { ruleId, cropName },
      },
    });
    if (!ruleOnCrop) return null;
    return RuleOnCrop.fromPrisma(ruleOnCrop);
  }

  async findByRuleId(ruleId: string): Promise<RuleOnCrop[]> {
    const crops = await this.prisma.ruleOnCrop.findMany({
      where: { ruleId },
      orderBy: { cropName: 'asc' },
    });
    return crops.map(RuleOnCrop.fromPrisma);
  }

  async findByCropName(cropName: string): Promise<RuleOnCrop[]> {
    const crops = await this.prisma.ruleOnCrop.findMany({
      where: { cropName },
    });
    return crops.map(RuleOnCrop.fromPrisma);
  }

  async update(id: string, data: Partial<RuleOnCrop>): Promise<RuleOnCrop> {
    const updated = await this.prisma.ruleOnCrop.update({
      where: { id },
      data: {
        cropName: data.cropName,
        cropType: data.cropType,
        parameters:
          data.parameters === null
            ? Prisma.JsonNull
            : data.parameters === undefined
              ? undefined
              : (data.parameters as Prisma.InputJsonValue),
      },
    });
    return RuleOnCrop.fromPrisma(updated);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.ruleOnCrop.delete({
      where: { id },
    });
  }

  async deleteByRuleAndCrop(ruleId: string, cropName: string): Promise<void> {
    await this.prisma.ruleOnCrop.delete({
      where: {
        ruleId_cropName: { ruleId, cropName },
      },
    });
  }
}
