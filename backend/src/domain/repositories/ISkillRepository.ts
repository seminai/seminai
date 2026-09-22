import { Skill } from '../entities/Skill';
import { SkillListFiltersDTO } from '../dtos/skill.dto';

export interface ISkillRepository {
  create(skill: Skill): Promise<Skill>;
  findById(id: string): Promise<Skill | null>;
  findBySlug(workspaceId: string, slug: string): Promise<Skill | null>;
  findWithFilters(filters: SkillListFiltersDTO): Promise<Skill[]>;
  update(id: string, data: Partial<Skill>): Promise<Skill>;
  delete(id: string): Promise<void>;
}
