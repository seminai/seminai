import { parseUsoSuoloFromOccupazione as parsePiemonteUsoSuolo } from '../file_agent/template/piemonte_file_structure';
import type { ProductionUnitCsvAgentContext } from './production-unit-csv-agent.context';

export function productionUnitCsvAgentResolvePiemonteCropName(this: ProductionUnitCsvAgentContext, occupazionePrimario: string | null, usoPrimario: string | null): string | null {
    const occupazioneName = occupazionePrimario ? parsePiemonteUsoSuolo(occupazionePrimario) : null;
    const usoPrimarioName = this.cleanBracketValue(usoPrimario);
    if (!occupazioneName) {
      return usoPrimarioName;
    }
    if (this.isGenericOccupazione(occupazioneName)) {
      return usoPrimarioName ?? occupazioneName;
    }
    return occupazioneName;
  }
