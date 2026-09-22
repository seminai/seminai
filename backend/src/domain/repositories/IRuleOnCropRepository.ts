import { RuleOnCrop } from '../entities/RuleOnCrop';

export interface IRuleOnCropRepository {
  create(ruleOnCrop: RuleOnCrop): Promise<RuleOnCrop>;
  findById(id: string): Promise<RuleOnCrop | null>;
  findByRuleAndCrop(ruleId: string, cropName: string): Promise<RuleOnCrop | null>;
  findByRuleId(ruleId: string): Promise<RuleOnCrop[]>;
  findByCropName(cropName: string): Promise<RuleOnCrop[]>;
  update(id: string, data: Partial<RuleOnCrop>): Promise<RuleOnCrop>;
  delete(id: string): Promise<void>;
  deleteByRuleAndCrop(ruleId: string, cropName: string): Promise<void>;
}
