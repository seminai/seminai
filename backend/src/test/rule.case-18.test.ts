import { Rule } from '../domain/entities/Rule';
import { RuleCategory, RuleStatus } from '@prisma/client';
describe('Rule Entity', () => {

  describe('isCurrentlyValid', () => {
    it('should return true when no date constraints', () => {
      const rule = new Rule(
        'id',
        'workspace-id',
        'name',
        'slug',
        null,
        RuleCategory.DISCIPLINARE,
        RuleStatus.ACTIVE,
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

      expect(rule.isCurrentlyValid()).toBe(true);
    });});});
