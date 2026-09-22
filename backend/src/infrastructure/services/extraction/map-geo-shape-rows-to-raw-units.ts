import type { ProductionUnitRaw } from '../agents/production_unit/production_unit_csv_agent';

export interface GeoShapeFieldRow {
  readonly name: string;
  readonly sezione?: string | null;
  readonly foglio?: string | null;
  readonly particella?: string | null;
  readonly subalterno?: string | null;
}

export interface GeoShapeProductionUnitRow {
  readonly name: string;
  readonly cropName: string;
  readonly cropType: string;
  readonly variety: string;
  readonly protocoll: string;
  readonly protectionStructure: string;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly areaHa: number;
  readonly fieldIndex: number;
  readonly destinazioneDiUso?: string | null;
}

export function mapGeoShapeRowsToRawUnits(
  fields: readonly GeoShapeFieldRow[],
  productionUnits: readonly GeoShapeProductionUnitRow[],
): ProductionUnitRaw[] {
  return productionUnits.map((pu) => {
    const linkedField = fields[pu.fieldIndex];
    return {
      name: pu.name,
      sezione: linkedField?.sezione ?? null,
      foglio: linkedField?.foglio ?? null,
      particella: linkedField?.particella ?? null,
      subalterno: linkedField?.subalterno ?? null,
      protocoll: pu.protocoll,
      startDate: pu.startDate,
      endDate: pu.endDate,
      areaHa: pu.areaHa,
      cycles: [
        {
          cycleIndex: 1,
          cropName: pu.cropName,
          cropType: pu.cropType,
          cropCode: pu.cropType,
          variety: pu.variety,
          occupazione: null,
          destinazione: pu.destinazioneDiUso ?? null,
          protectionStructure: pu.protectionStructure,
          startDate: pu.startDate,
          endDate: pu.endDate,
          floweringDate: null,
          harvestingDate: null,
        },
      ],
      allocations: linkedField
        ? [
            {
              fieldName: linkedField.name,
              sezione: linkedField.sezione ?? null,
              foglio: linkedField.foglio ?? null,
              particella: linkedField.particella ?? null,
              subalterno: linkedField.subalterno ?? null,
              areaHa: pu.areaHa,
            },
          ]
        : [],
    };
  });
}
