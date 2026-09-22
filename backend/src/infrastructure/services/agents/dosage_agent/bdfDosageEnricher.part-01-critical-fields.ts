import { LabelDoseDetail } from '../../../../domain/dtos/label.dto';
import { type BdfDose } from '../../integrations/bdf';

export const CRITICAL_FIELDS: ReadonlyArray<keyof LabelDoseDetail> = [
  'n_max_applicazioni',
  'intervallo_min_giorni',
  'intervallo_sicurezza_giorni',
  'dose_minima',
  'dose_massima',
];

export function needsEnrichment(dosageDetails: ReadonlyArray<LabelDoseDetail>): boolean {
  return dosageDetails.some((d) => CRITICAL_FIELDS.some((field) => d[field] == null));
}

export function mapBdfDoseToLabelDoseDetail(dose: BdfDose, cropName: string): LabelDoseDetail {
  return {
    coltura: dose.NOME_SCI || cropName,
    malattia: dose.NOME_ITA || null,
    dose_minima: dose.DOSE_MIN,
    dose_massima: dose.DOSE_MAX,
    dose_um: dose.DECO_UM_DOSE,
    acqua_max: dose.ACQUA_HA_MAX,
    acqua_max_um: dose.ACQUA_HA_MAX != null ? 'l/ha' : null,
    n_max_applicazioni: dose.NUM_MAX_INT,
    n_max_applicazioni_um: dose.RIF_MAX_TRATT,
    intervallo_min_giorni: dose.INTERV_TRATT,
    intervallo_sicurezza_giorni: dose.CARENZA != null && dose.CARENZA !== 999 ? dose.CARENZA : null,
    epoca_impiego: dose.DECO_STADIO_COLT,
    modalita_applicazione: dose.DECO_METODO_DIST,
    istruzioni: dose.NOTE,
  };
}

export function mergeDosageDetail(original: LabelDoseDetail, bdfMatch: LabelDoseDetail): LabelDoseDetail {
  return {
    ...original,
    n_max_applicazioni: original.n_max_applicazioni ?? bdfMatch.n_max_applicazioni,
    n_max_applicazioni_um: original.n_max_applicazioni_um ?? bdfMatch.n_max_applicazioni_um,
    intervallo_min_giorni: original.intervallo_min_giorni ?? bdfMatch.intervallo_min_giorni,
    intervallo_sicurezza_giorni:
      original.intervallo_sicurezza_giorni ?? bdfMatch.intervallo_sicurezza_giorni,
    dose_minima: original.dose_minima ?? bdfMatch.dose_minima,
    dose_massima: original.dose_massima ?? bdfMatch.dose_massima,
    dose_um: original.dose_um ?? bdfMatch.dose_um,
    epoca_impiego: original.epoca_impiego ?? bdfMatch.epoca_impiego,
    acqua_max: original.acqua_max ?? bdfMatch.acqua_max,
    acqua_max_um: original.acqua_max_um ?? bdfMatch.acqua_max_um,
    modalita_applicazione: original.modalita_applicazione ?? bdfMatch.modalita_applicazione,
  };
}
