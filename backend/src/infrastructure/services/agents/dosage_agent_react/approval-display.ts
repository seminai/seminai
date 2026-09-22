import { getWorkingMemory } from './working-memory';
import { classifyRisk, type RiskLevel } from './graph/risk-classifier';

type DisplayToolCall = {
  name: string;
  args: Record<string, unknown>;
  id?: string;
  riskLevel?: RiskLevel;
  riskScore?: number;
  riskReason?: string;
};

interface WorkingMemoryProductionUnitRef {
  readonly id: string;
  readonly name?: string;
  readonly cropName?: string;
  readonly variety?: string | null;
  readonly startDate?: Date;
  readonly floweringDate?: Date;
  readonly harvestingDate?: Date;
  readonly endDate?: Date;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function shouldHideKey(key: string): boolean {
  const normalizedKey = key.toLowerCase();
  return normalizedKey === 'id' || normalizedKey.endsWith('id');
}

function sanitizeDisplayValue(value: unknown, parentKey?: string): unknown {
  if (parentKey && shouldHideKey(parentKey)) {
    return undefined;
  }
  if (typeof value === 'string' && UUID_REGEX.test(value)) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDisplayValue(item)).filter((item) => item !== undefined);
  }
  if (value && typeof value === 'object') {
    const sanitizedEntries = Object.entries(value).flatMap(([key, nestedValue]) => {
      const sanitizedValue = sanitizeDisplayValue(nestedValue, key);
      if (sanitizedValue === undefined) {
        return [];
      }
      return [[key, sanitizedValue] as const];
    });
    return Object.fromEntries(sanitizedEntries);
  }
  return value;
}

export function sanitizeToolArgsForDisplay(args: Record<string, unknown>): Record<string, unknown> {
  const sanitized = sanitizeDisplayValue(args);
  if (!sanitized || typeof sanitized !== 'object' || Array.isArray(sanitized)) {
    return {};
  }
  return sanitized as Record<string, unknown>;
}

export function sanitizeToolCallForDisplay(toolCall: DisplayToolCall): DisplayToolCall {
  return {
    name: toolCall.name,
    args: sanitizeToolArgsForDisplay(toolCall.args),
  };
}

export function sanitizePendingToolCallsForDisplay(
  toolCalls: DisplayToolCall[],
): DisplayToolCall[] {
  return toolCalls.map((toolCall) => sanitizeToolCallForDisplay(toolCall));
}

function formatDateForDisplay(value?: Date): string | null {
  if (!value) {
    return null;
  }
  return value.toISOString().slice(0, 10);
}

function enrichUpdateProductionUnitsArgs(
  threadId: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const workingMemoryUnits =
    (getWorkingMemory(threadId).inputUnits as WorkingMemoryProductionUnitRef[] | undefined) ?? [];
  const updates = Array.isArray(args.updates) ? args.updates : [];

  return {
    reason: typeof args.reason === 'string' ? args.reason : undefined,
    updates: updates.flatMap((rawUpdate) => {
      if (!rawUpdate || typeof rawUpdate !== 'object') {
        return [];
      }
      const update = rawUpdate as Record<string, unknown>;
      const matchedUnit = workingMemoryUnits.find((unit) => {
        if (typeof update.productionUnitId === 'string' && unit.id === update.productionUnitId) {
          return true;
        }
        return (
          typeof update.productionUnitName === 'string' &&
          typeof unit.name === 'string' &&
          unit.name.toLowerCase() === update.productionUnitName.toLowerCase()
        );
      });

      return [
        {
          productionUnitName:
            matchedUnit?.name ??
            (typeof update.productionUnitName === 'string'
              ? update.productionUnitName
              : 'Unità produttiva'),
          cropName: matchedUnit?.cropName ?? null,
          variety: matchedUnit?.variety ?? null,
          currentStartDate: formatDateForDisplay(matchedUnit?.startDate),
          currentFloweringDate: formatDateForDisplay(matchedUnit?.floweringDate),
          currentHarvestingDate: formatDateForDisplay(matchedUnit?.harvestingDate),
          currentEndDate: formatDateForDisplay(matchedUnit?.endDate),
          newStartDate: typeof update.startDate === 'string' ? update.startDate.slice(0, 10) : null,
          newFloweringDate:
            typeof update.floweringDate === 'string' ? update.floweringDate.slice(0, 10) : null,
          newHarvestingDate:
            typeof update.harvestingDate === 'string' ? update.harvestingDate.slice(0, 10) : null,
          newEndDate: typeof update.endDate === 'string' ? update.endDate.slice(0, 10) : null,
        },
      ];
    }),
  };
}

export function buildToolCallForDisplay(
  threadId: string,
  toolCall: DisplayToolCall,
): DisplayToolCall {
  const risk = classifyRisk(toolCall.name, toolCall.args);
  const riskFields = {
    riskLevel: risk.level,
    riskScore: risk.score,
    riskReason: risk.reason,
  };

  if (toolCall.name === 'update_production_units') {
    return {
      name: toolCall.name,
      args: enrichUpdateProductionUnitsArgs(threadId, toolCall.args),
      ...riskFields,
    };
  }

  return { ...sanitizeToolCallForDisplay(toolCall), ...riskFields };
}

export function buildPendingToolCallsForDisplay(
  threadId: string,
  toolCalls: DisplayToolCall[],
): DisplayToolCall[] {
  return toolCalls.map((toolCall) => buildToolCallForDisplay(threadId, toolCall));
}
