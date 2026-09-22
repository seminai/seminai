import type {
  ShapefileExtractedField,
  ShapefileExtractedProductionUnit,
} from '../../../shapefile-parser';
import type { FieldExtracted, ProductionUnitExtracted } from './file-extraction-types';

export function mapShapefileFieldToExtracted(sf: ShapefileExtractedField): FieldExtracted {
  return {
    name: sf.name,
    foglio: sf.foglio ?? undefined,
    particella: sf.particella ?? undefined,
    sezione: sf.sezione,
    comune: sf.city ?? undefined,
    superficieCatastaleHa:
      sf.superficieCatastaleMq != null ? sf.superficieCatastaleMq / 10000 : null,
    superficieCatastaleMq: sf.superficieCatastaleMq,
    sauHa: sf.sauHa,
    gisHa: sf.gisHa,
    usiSuolo: sf.uso ? [sf.uso] : undefined,
    qualita: sf.qualita,
    latitude: sf.latitude,
    longitude: sf.longitude,
    coordinates: sf.coordinates,
    polygon: sf.polygon,
    coordinatesGaussBoaga: sf.coordinatesGaussBoaga,
    polygonGaussBoaga: sf.polygonGaussBoaga,
    nation: sf.nation ?? 'IT',
    region: sf.region,
    soilType: sf.soilType,
    inizioConduzione: sf.inizioConduzione,
    fineConduzione: sf.fineConduzione,
  };
}

export function mapShapefileProductionUnitToExtracted(
  pu: ShapefileExtractedProductionUnit,
): ProductionUnitExtracted {
  return {
    name: pu.name,
    areaHa: pu.areaHa,
    startDate: pu.startDate,
    endDate: pu.endDate,
    fieldIndex: pu.fieldIndex,
    cropType: pu.cropType,
    protocoll: pu.protocoll,
    protectionStructure: pu.protectionStructure,
    destinazioneDiUso: pu.destinazioneDiUso,
    cycles: [
      {
        cropName: pu.cropName,
        variety: pu.variety,
        startDate: pu.startDate,
        endDate: pu.endDate,
      },
    ],
  };
}
