/**
 * Hand-written view types for the EU fertilizer label variant (`prodotto_fertilizzante_ue`).
 * The generated `Label` schema does not document this branch, so the detail UI narrows from
 * these shapes. All fields are optional/nullable because the payload comes from AI extraction.
 */

export interface FertilizerIdentification {
  readonly nome_commerciale?: string | null;
  readonly funzione_categoria_prodotto?: string | null;
  readonly numero_lotto?: string | null;
  readonly stato_fisico?: string | null;
  readonly confezioni_disponibili?: string | null;
  readonly quantita_nominale?: string | null;
}

export interface FertilizerCropDose {
  readonly coltura?: string | null;
  readonly fase_fenologica?: string | null;
  readonly dose_kg_ha?: number | string | null;
  readonly dose_kg_ha_min?: number | string | null;
  readonly dose_kg_ha_max?: number | string | null;
}

export interface FertilizerAgronomicInstructions {
  readonly uso_previsto?: string | null;
  readonly frequenza?: string | null;
  readonly condizioni_stoccaggio?: string | null;
  readonly dosi_applicazione?: {
    readonly specifiche_coltura?: readonly FertilizerCropDose[] | null;
  } | null;
}

export interface FertilizerProduct {
  readonly identificazione_prodotto?: FertilizerIdentification | null;
  readonly composizione_garantita?: Record<string, unknown> | null;
  readonly istruzioni_uso_agronomiche?: FertilizerAgronomicInstructions | null;
  readonly informazioni_sicurezza_clp?: Record<string, unknown> | null;
}
