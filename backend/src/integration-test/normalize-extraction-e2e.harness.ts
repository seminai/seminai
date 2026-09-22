import { ToolMessage } from '@langchain/core/messages';
import { prisma } from './helpers';
import type { ExtractionReviewPayload } from '../infrastructure/services/agents/dosage_agent_react/type/events';

export const mockAddJob = jest.fn().mockResolvedValue('job-test-123');

export const capturedReviewPayloads: ExtractionReviewPayload[] = [];

export function toolSequence(messages: readonly unknown[]): string[] {
  return messages
    .filter((m): m is ToolMessage => m instanceof ToolMessage)
    .map((m) => m.name as string);
}

export function buildExtractedFileData(includeOccupiedCadastral: boolean) {
  return {
    companies: [],
    fields: [
      {
        name: 'Vigna A',
        foglio: '12',
        particella: '34',
        comune: 'Verona',
        usiSuolo: ['Vite'],
        sauHa: 2,
      },
      {
        name: 'Vigna B',
        foglio: '13',
        particella: '5',
        comune: 'Verona',
        usiSuolo: ['Vite'],
        sauHa: 1,
      },
      {
        name: 'Oliveto',
        foglio: '20',
        particella: '7',
        comune: 'Lazise',
        usiSuolo: ['Olivo'],
        sauHa: 3,
      },
    ],
    productionUnits: [
      ...(includeOccupiedCadastral
        ? [
            {
              name: 'UP Vite A',
              cropType: 'Da vino',
              protocoll: 'Convenzionale',
              areaHa: 2,
              cycles: [
                {
                  cropName: 'Vite',
                  variety: 'Sangiovese',
                  startDate: '2026-04-01',
                  endDate: '2026-10-15',
                },
              ],
              allocations: [{ foglio: '12', particella: '34' }],
            },
          ]
        : []),
      {
        name: 'UP Vite B',
        cropType: 'Da vino',
        protocoll: 'Convenzionale',
        areaHa: 1,
        cycles: [
          {
            cropName: 'Vite',
            variety: 'Sangiovese',
            startDate: '2026-04-01',
            endDate: '2026-10-15',
          },
        ],
        allocations: [{ foglio: '13', particella: '5' }],
      },
      {
        name: 'UP Olivo',
        cropType: 'Olio',
        protocoll: 'Biologico',
        areaHa: 3,
        cycles: [
          {
            cropName: 'Olivo',
            variety: 'Frantoio',
            startDate: '2026-05-01',
            endDate: '2026-11-30',
          },
        ],
        allocations: [{ foglio: '20', particella: '7' }],
      },
    ],
  };
}

export async function seedOccupiedField(companyId: string): Promise<string> {
  const field = await prisma.field.create({
    data: {
      name: 'Campo Preesistente',
      companyId,
      coordinates: [],
      foglio: '12',
      particella: '34',
      city: 'Verona',
      sauHa: 2,
      uso: 'Vite',
    },
  });
  const pu = await prisma.productionUnit.create({
    data: {
      name: 'UP preesistente',
      areaHa: 2,
      startDate: new Date('2026-03-01'),
      endDate: new Date('2026-11-30'),
    },
  });
  await prisma.productionCycle.create({
    data: {
      productionUnitId: pu.id,
      cropName: 'Vite',
      cropType: 'Da vino',
      variety: 'Sangiovese',
      protocoll: 'Convenzionale',
      seasonYear: 2026,
      cycleIndex: 0,
      protectionStructure: 'Nessuna',
      acquaTotalePeridoL: 0,
    },
  });
  await prisma.productionUnitOnField.create({
    data: { productionUnitId: pu.id, fieldId: field.id, areaHaOnField: 2 },
  });
  return field.id;
}

export const describeIfLLM = process.env.OPENROUTER_API_KEY ? describe : describe.skip;
