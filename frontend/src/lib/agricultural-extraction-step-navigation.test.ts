import { describe, expect, it, vi } from 'vitest';
import type { AgriculturalStep } from '@/components/organisms/agricultural-extraction-section';

describe('agricultural step navigation', () => {
  it('keeps parent step in sync when advancing via onStepChange', async () => {
    let currentStep: AgriculturalStep = 'fields';
    const onStepChange = vi.fn((nextStep: AgriculturalStep) => {
      currentStep = nextStep;
    });

    await Promise.resolve(onStepChange('production_units'));

    expect(onStepChange).toHaveBeenCalledWith('production_units');
    expect(currentStep).toBe('production_units');
  });

  it('does not reset step when only extraction updatedAt changes', () => {
    const currentStep: AgriculturalStep = 'production_units';
    const extractionId = 'extraction-1';
    const previousUpdatedAt = '2026-06-25T09:00:00.000Z';
    const nextUpdatedAt = '2026-06-25T09:05:00.000Z';

    expect(extractionId).toBe('extraction-1');
    expect(previousUpdatedAt).not.toBe(nextUpdatedAt);
    expect(currentStep).toBe('production_units');
  });

  it('resets step when extraction id changes', () => {
    let currentStep: AgriculturalStep = 'production_units';
    const onStepChange = (nextStep: AgriculturalStep) => {
      currentStep = nextStep;
    };

    onStepChange('fields');

    expect(currentStep).toBe('fields');
  });
});
