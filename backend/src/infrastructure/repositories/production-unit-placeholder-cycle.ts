import { randomUUID } from 'node:crypto';

interface ProductionUnitTimestamps {
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export function createPlaceholderCycle(pu: ProductionUnitTimestamps) {
  return {
    id: randomUUID(),
    cropName: '',
    cropType: '',
    variety: '',
    protocoll: '',
    protectionStructure: '',
    floweringDate: null,
    harvestingDate: null,
    occupazione: null,
    destinazioneDiUso: null,
    acquaTotalePeridoL: 0,
    seasonYear: new Date().getUTCFullYear(),
    cycleIndex: 1,
    createdAt: pu.createdAt,
    updatedAt: pu.updatedAt,
  };
}
