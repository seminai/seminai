import { Rule } from '../domain/entities/Rule';
import { RuleCategory, RuleStatus } from '@prisma/client';
describe('Rule Entity', () => {

  describe('isCurrentlyValid', () => {

    it('should return false when validUntil is in the past', () => {
      const pastDate = new Date(Date.now() - 1000 * 60 * 60 * 24);
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
        pastDate,
        '1.0',
        false,
        false,
        'user-id',
        new Date(),
        new Date(),
      );

      expect(rule.isCurrentlyValid()).toBe(false);
    });});});
