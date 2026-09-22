import { buildPendingToolCallsForDisplay, sanitizeToolArgsForDisplay } from '../approval-display';
import { updateWorkingMemory } from '../working-memory';

describe('approval-display', () => {
  it('removes ids recursively from approval payload args', () => {
    const inputArgs = {
      updates: [
        {
          productionUnitId: 'b627c3fe-3d35-4e0d-a388-e1cbf58ac5b7',
          startDate: '2026-02-17',
          endDate: '2026-06-17',
          nested: {
            companyId: '04f85263-a022-4249-bc35-5722279761c8',
            note: 'visible',
          },
        },
      ],
      requestId: 'req-1',
    };

    expect(sanitizeToolArgsForDisplay(inputArgs)).toEqual({
      updates: [
        {
          startDate: '2026-02-17',
          endDate: '2026-06-17',
          nested: {
            note: 'visible',
          },
        },
      ],
    });
  });

  it('removes internal tool_call ids from pending approvals', () => {
    const sanitized = buildPendingToolCallsForDisplay('thread-generic', [
      {
        name: 'update_production_units',
        id: 'call-1',
        args: {
          productionUnitId: 'b627c3fe-3d35-4e0d-a388-e1cbf58ac5b7',
          reason: 'Correzione',
        },
      },
    ]);

    expect(sanitized).toEqual([
      {
        name: 'update_production_units',
        args: {
          reason: 'Correzione',
          updates: [],
        },
        riskLevel: 'medium',
        riskScore: 35,
        riskReason: 'base score for update_production_units',
      },
    ]);
  });

  it('enriches production-unit approval payload with readable unit data', () => {
    updateWorkingMemory('thread-update-preview', {
      inputUnits: [
        {
          id: 'b627c3fe-3d35-4e0d-a388-e1cbf58ac5b7',
          name: 'Frumento tenero - Bologna',
          cropName: 'Frumento tenero',
          variety: 'Bologna',
          startDate: new Date('2026-02-17T00:00:00.000Z'),
          endDate: new Date('2026-02-17T00:00:00.000Z'),
        },
      ],
    });

    const sanitized = buildPendingToolCallsForDisplay('thread-update-preview', [
      {
        name: 'update_production_units',
        id: 'call-2',
        args: {
          reason: 'Allineamento ciclo colturale',
          updates: [
            {
              productionUnitId: 'b627c3fe-3d35-4e0d-a388-e1cbf58ac5b7',
              startDate: '2026-10-14',
              endDate: '2027-06-14',
            },
          ],
        },
      },
    ]);

    expect(sanitized).toEqual([
      {
        name: 'update_production_units',
        args: {
          reason: 'Allineamento ciclo colturale',
          updates: [
            {
              productionUnitName: 'Frumento tenero - Bologna',
              cropName: 'Frumento tenero',
              variety: 'Bologna',
              currentStartDate: '2026-02-17',
              currentFloweringDate: null,
              currentHarvestingDate: null,
              currentEndDate: '2026-02-17',
              newStartDate: '2026-10-14',
              newFloweringDate: null,
              newHarvestingDate: null,
              newEndDate: '2027-06-14',
            },
          ],
        },
        riskLevel: 'medium',
        riskScore: 35,
        riskReason: 'base score for update_production_units',
      },
    ]);
  });

  it('attaches risk classification based on RAW args (bulk modifier on jobIds)', () => {
    const sanitized = buildPendingToolCallsForDisplay('thread-bulk', [
      {
        name: 'optimize_selected_jobs',
        id: 'call-bulk',
        args: {
          selectedJobIds: Array.from({ length: 55 }, (_, i) => `job-${i}`),
        },
      },
    ]);

    expect(sanitized[0].riskLevel).toBe('high');
    expect(sanitized[0].riskScore).toBe(75);
    expect(sanitized[0].riskReason).toContain('bulk operation (55 items)');
  });
});
