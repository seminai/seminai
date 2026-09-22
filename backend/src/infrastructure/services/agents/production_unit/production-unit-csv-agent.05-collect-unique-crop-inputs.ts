import { type ParsedRow } from '../file_agent/utils/csv_parser';
import { CropIdentificationInput, ColumnMapping } from './production_unit_csv_agent.support';
import type { ProductionUnitCsvAgentContext } from './production-unit-csv-agent.context';

export function productionUnitCsvAgentCollectUniqueCropInputs(this: ProductionUnitCsvAgentContext, rows: ParsedRow[], mapping: ColumnMapping): CropIdentificationInput[] {
    const cols = mapping.columns;
    const cropInputsMap = new Map<string, CropIdentificationInput>();

    for (const row of rows) {
      // Primary occupation + variety
      const occupazionePrimariaRaw = this.getValue(row, cols.occupazioneSuoloPrimario);
      if (occupazionePrimariaRaw) {
        const { name: occupazioneName } = this.parseOccupazione(occupazionePrimariaRaw);
        if (occupazioneName) {
          const varietaPrimaria = this.cleanBracketValue(
            this.getValue(row, cols.varietaUsoSuoloPrimario),
          );
          const key = this.buildCropCacheKey(occupazioneName, varietaPrimaria);
          if (!cropInputsMap.has(key)) {
            cropInputsMap.set(key, { cropName: occupazioneName, variety: varietaPrimaria });
          }
        }
      }

      // Secondary occupation + variety (if present)
      const occupazioneSecondariaRaw = this.getValue(row, cols.occupazioneSuoloSecondario);
      if (occupazioneSecondariaRaw) {
        const { name: occupazioneSecondariaName } = this.parseOccupazione(occupazioneSecondariaRaw);
        if (occupazioneSecondariaName) {
          const varietaSecondaria = this.cleanBracketValue(
            this.getValue(row, cols.varietaUsoSuoloSecondario),
          );
          const key = this.buildCropCacheKey(occupazioneSecondariaName, varietaSecondaria);
          if (!cropInputsMap.has(key)) {
            cropInputsMap.set(key, {
              cropName: occupazioneSecondariaName,
              variety: varietaSecondaria,
            });
          }
        }
      }

      // Legacy format cropName + variety
      const cropName = this.getValue(row, cols.cropName);
      if (cropName) {
        const variety = this.getValue(row, cols.variety);
        const key = this.buildCropCacheKey(cropName, variety);
        if (!cropInputsMap.has(key)) {
          cropInputsMap.set(key, { cropName, variety });
        }
      }
    }

    return Array.from(cropInputsMap.values());
  }
