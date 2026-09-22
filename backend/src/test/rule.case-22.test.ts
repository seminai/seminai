import { Rule } from '../domain/entities/Rule';
import { RuleCategory, RuleStatus } from '@prisma/client';
describe('Rule Entity', () => {

  describe('isDisciplinare', () => {

    it('should return false for STANDARD category', () => {
      const rule = new Rule(
        'id',
        'workspace-id',
        'name',
        'slug',
        null,
        RuleCategory.STANDARD,
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

      expect(rule.isDisciplinare()).toBe(false);
    });});});
