import { randomUUID } from 'node:crypto';
import { RuleOnCrop as PrismaRuleOnCrop, Prisma } from '@prisma/client';

interface RuleOnCropProps {
  ruleId: string;
  cropName: string;
  cropType: string | null;
  parameters: Prisma.JsonValue | null;
}

export class RuleOnCrop {
  public readonly id: string;
  public readonly ruleId: string;
  public readonly cropName: string;
  public readonly cropType: string | null;
  public readonly parameters: Prisma.JsonValue | null;
  public readonly createdAt: Date;

  constructor(
    id: string,
    ruleId: string,
    cropName: string,
    cropType: string | null,
    parameters: Prisma.JsonValue | null,
    createdAt: Date,
  ) {
    this.id = id;
    this.ruleId = ruleId;
    this.cropName = cropName;
    this.cropType = cropType;
    this.parameters = parameters;
    this.createdAt = createdAt;
  }

  static create(props: RuleOnCropProps): RuleOnCrop {
    const now = new Date();
    return new RuleOnCrop(
      randomUUID(),
      props.ruleId,
      props.cropName,
      props.cropType,
      props.parameters,
      now,
    );
  }

  static fromPrisma(prismaRuleOnCrop: PrismaRuleOnCrop): RuleOnCrop {
    return new RuleOnCrop(
      prismaRuleOnCrop.id,
      prismaRuleOnCrop.ruleId,
      prismaRuleOnCrop.cropName,
      prismaRuleOnCrop.cropType,
      prismaRuleOnCrop.parameters,
      prismaRuleOnCrop.createdAt,
    );
  }
}
