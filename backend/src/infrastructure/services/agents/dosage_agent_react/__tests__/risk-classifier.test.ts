import { classifyRisk, shouldAutoApprove, BASE_RISK_SCORES } from '../graph/risk-classifier';

describe('risk-classifier', () => {
  describe('entity creation tools require approval (score >= 30)', () => {
    it.each([
      'create_fields',
      'create_production_units',
      'create_company',
      'update_production_units',
    ])('%s has base score >= 30', (toolName) => {
      const result = classifyRisk(toolName, {});
      expect(result.score).toBeGreaterThanOrEqual(30);
      expect(result.level).not.toBe('low');
      expect(shouldAutoApprove(result)).toBe(false);
    });
  });

  describe('bulk modifiers', () => {
    it('adds +25 for 21-50 items', () => {
      const result = classifyRisk('create_treatment_jobs', {
        jobIds: Array(25).fill('x'),
      });
      expect(result.score).toBe(BASE_RISK_SCORES['create_treatment_jobs']! + 25);
    });

    it('adds +40 for >50 items', () => {
      const result = classifyRisk('optimize_selected_jobs', {
        selectedJobIds: Array(55).fill('x'),
      });
      expect(result.score).toBe(BASE_RISK_SCORES['optimize_selected_jobs']! + 40);
      expect(result.level).toBe('high');
    });
  });

  describe('overwrite modifier', () => {
    it('adds +30 for overwrite=true', () => {
      const result = classifyRisk('import_from_file', { overwrite: true });
      expect(result.score).toBe(BASE_RISK_SCORES['import_from_file']! + 30);
      // 40 + 30 = 70 → medium (threshold is <= 70)
      expect(result.level).toBe('medium');
    });

    it('adds +30 for replacePdfFromChat=true', () => {
      const result = classifyRisk('import_from_file', { replacePdfFromChat: true });
      expect(result.score).toBe(BASE_RISK_SCORES['import_from_file']! + 30);
    });
  });

  describe('shouldAutoApprove', () => {
    it('returns true for low risk', () => {
      expect(shouldAutoApprove({ score: 10, level: 'low', reason: 'test' })).toBe(true);
    });

    it('returns false for medium risk', () => {
      expect(shouldAutoApprove({ score: 40, level: 'medium', reason: 'test' })).toBe(false);
    });

    it('returns false for high risk', () => {
      expect(shouldAutoApprove({ score: 80, level: 'high', reason: 'test' })).toBe(false);
    });
  });

  describe('unknown tools', () => {
    it('auto-approves explicitly low-risk tools', () => {
      const result = classifyRisk('search_products', {});
      expect(result.score).toBe(5);
      expect(result.level).toBe('low');
      expect(shouldAutoApprove(result)).toBe(true);
    });

    it('requires approval for unknown tools by default', () => {
      const result = classifyRisk('new_unclassified_tool', {});
      expect(result.score).toBe(50);
      expect(result.level).toBe('medium');
      expect(result.reason).toContain('unknown tool');
      expect(shouldAutoApprove(result)).toBe(false);
    });
  });

  describe('workspace rule tools require approval', () => {
    it('create_workspace_rule has score 35 (medium)', () => {
      const result = classifyRisk('create_workspace_rule', {});
      expect(result.score).toBe(35);
      expect(result.level).toBe('medium');
      expect(shouldAutoApprove(result)).toBe(false);
    });
  });

  describe('diagnosis & recommendation tools are read-only (auto-approve)', () => {
    it.each(['diagnose_from_photo', 'recommend_best_products'])(
      '%s is low risk and auto-approves',
      (toolName) => {
        const result = classifyRisk(toolName, {});
        expect(result.score).toBe(5);
        expect(result.level).toBe('low');
        expect(shouldAutoApprove(result)).toBe(true);
      },
    );
  });
});
