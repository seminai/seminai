export interface FertilizerNominalQuantity {
  readonly valore: number | null;
  readonly unita: string | null;
}

export interface FertilizerProductIdentification {
  readonly nome_commerciale: string | null;
  readonly funzione_categoria_prodotto: string | null;
  readonly numero_lotto: string | null;
  readonly stato_fisico: string | null;
  readonly confezioni_disponibili: ReadonlyArray<string>;
  readonly quantita_nominale: FertilizerNominalQuantity | null;
}

export interface FertilizerNpkAnalysis {
  readonly N_totale: number | null;
  readonly P2O5_totale: number | null;
  readonly K2O_totale: number | null;
}

export interface FertilizerMesoElements {
  readonly CaO_totale: number | null;
  readonly MgO_totale: number | null;
  readonly SO3_totale: number | null;
  readonly Na2O_totale: number | null;
}

export interface FertilizerNitrogenForm {
  readonly tipo: string | null;
  readonly percentuale: number | null;
}

export interface FertilizerPhosphorusSolubility {
  readonly P2O5_solubile_acqua: number | null;
  readonly P2O5_solubile_citrato_ammonio_neutro: number | null;
}

export interface FertilizerMicronutrient {
  readonly elemento: string | null;
  readonly percentuale: number | null;
  readonly unita: string | null;
}

export interface FertilizerOrganicParameters {
  readonly carbonio_organico_biologico: number | null;
  readonly acidi_umici_fulvici: number | null;
  readonly sostanza_organica: number | null;
}

export interface FertilizerPhysicoChemicalCharacteristics {
  readonly pH: number | null;
  readonly densita_20_gradi: number | null;
  readonly salinita: number | null;
}

export interface FertilizerComponentAboveThreshold {
  readonly ingrediente: string | null;
  readonly CMC: string | null;
}

export interface FertilizerGuaranteedComposition {
  readonly analisi_principale_NPK_percentuale_peso: FertilizerNpkAnalysis | null;
  readonly meso_elementi_percentuale_peso: FertilizerMesoElements | null;
  readonly forme_azoto: ReadonlyArray<FertilizerNitrogenForm>;
  readonly solubilita_fosforo: FertilizerPhosphorusSolubility | null;
  readonly micronutrienti: ReadonlyArray<FertilizerMicronutrient>;
  readonly parametri_organici_biologici: FertilizerOrganicParameters | null;
  readonly elenco_componenti_sopra_5_percento: ReadonlyArray<FertilizerComponentAboveThreshold>;
  readonly caratteristiche_chimico_fisiche: FertilizerPhysicoChemicalCharacteristics | null;
}

export interface FertilizerCropDose {
  readonly coltura: string | null;
  readonly dose_kg_ha_min: number | null;
  readonly dose_kg_ha_max: number | null;
  readonly fase_fenologica: string | null;
}

export interface FertilizerApplicationRates {
  readonly generale_kg_per_ettaro: number | null;
  readonly specifiche_coltura: ReadonlyArray<FertilizerCropDose>;
}

export interface FertilizerAgronomicInstructions {
  readonly uso_previsto: string | null;
  readonly dosi_applicazione: FertilizerApplicationRates | null;
  readonly frequenza: string | null;
  readonly condizioni_stoccaggio: string | null;
}

export interface FertilizerClpInformation {
  readonly avvertenza: string | null;
  readonly pittogrammi_pericolo: ReadonlyArray<string>;
  readonly indicazioni_pericolo_H: ReadonlyArray<string>;
  readonly consigli_prudenza_P: ReadonlyArray<string>;
  readonly note_mediche: string | null;
}

export interface FertilizerProductUe {
  readonly identificazione_prodotto: FertilizerProductIdentification | null;
  readonly composizione_garantita: FertilizerGuaranteedComposition | null;
  readonly istruzioni_uso_agronomiche: FertilizerAgronomicInstructions | null;
  readonly informazioni_sicurezza_clp: FertilizerClpInformation | null;
}

export interface FertilizerLabel {
  readonly prodotto_fertilizzante_ue: FertilizerProductUe | null;
}
