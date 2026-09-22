import { Rule } from '../domain/entities/Rule';
import { RuleCategory, RuleStatus } from '@prisma/client';
describe('Rule Entity', () => {

  describe('isActive', () => {

    it('should return false when status is DRAFT', () => {
      const rule = new Rule(
        'id',
        'workspace-id',
        'name',
        'slug',
        null,
        RuleCategory.DISCIPLINARE,
        RuleStatus.DRAFT,
        {},
        null,
        null,
        null,
        null,
        null,
        '1.0',
        false,
        false,
        'user-id',
        new Date(),
        new Date(),
      );

      expect(rule.isActive()).toBe(false);
    });});});
