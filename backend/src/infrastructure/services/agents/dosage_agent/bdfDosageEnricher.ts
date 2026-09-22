/**
 * BDF Dosage Enricher
 *
 * Two modes of operation:
 * A) ENRICHMENT: When label extraction has dosageDetails but some fields are null,
 *    queries BDF to fill gaps (n_max_applicazioni, intervallo_min_giorni, dose, PHI).
 * B) PRIMARY SOURCE: When findDosageDetails() returned empty (e.g. crop name mismatch),
 *    queries BDF to CREATE dosageDetails entirely from the API.
 *
 * Flow:
 * 1. Check if dosageDetails need enrichment OR are empty (label matching failed)
 * 2. Resolve product code, crop ID, and adversity codes via BDF API
 * 3. Fetch doses from BDF
 * 4. Merge (mode A) or return directly (mode B)
 *
 * If BDF API fails at any step → log warning and return original data unchanged.
 */

import { Label, LabelDoseDetail } from '../../../../domain/dtos/label.dto';
import {
  createCachedBdfClient,
  findBestDirectMatch,
  resolveNameWithLlm,
  type BdfDose,
  type BdfProdotto,
} from '../../integrations/bdf';

const CRITICAL_FIELDS: ReadonlyArray<keyof LabelDoseDetail> = [
  'n_max_applicazioni',
  'intervallo_min_giorni',
  'intervallo_sicurezza_giorni',
  'dose_minima',
  'dose_massima',
];

function needsEnrichment(dosageDetails: ReadonlyArray<LabelDoseDetail>): boolean {
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

function mergeDosageDetail(original: LabelDoseDetail, bdfMatch: LabelDoseDetail): LabelDoseDetail {
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

/**
 * Enriches dosageDetails with data from the live BDF API, or creates them from scratch.
 *
 * Mode A (enrichment): When dosageDetails exist but have null critical fields,
 *   fills gaps from BDF. Label extraction data always takes priority.
 * Mode B (primary source): When dosageDetails is empty (label crop matching failed),
 *   fetches all available doses from BDF for this product+crop combination.
 *
 * If BDF API fails, returns the original dosageDetails unchanged.
 */
export async function enrichDosageDetailsFromBdf(
  dosageDetails: ReadonlyArray<LabelDoseDetail>,
  registrationNumber: string,
  productName: string,
  cropName: string,
): Promise<ReadonlyArray<LabelDoseDetail>> {
  const isBdfPrimaryMode = dosageDetails.length === 0;
  if (!isBdfPrimaryMode && !needsEnrichment(dosageDetails)) return dosageDetails;

  try {
    const client = createCachedBdfClient();

    // Step 1: Resolve product code
    // Strip trademark symbols (®, ™) that label extraction may add
    const cleanProductName = productName.replace(/[®™©]/g, '').trim();
    const products = await client.getProdotti({ ricalfa: cleanProductName });
    if (products.length === 0) {
      console.warn(`[BDF-ENRICH] Product "${cleanProductName}" not found in BDF`);
      return dosageDetails;
    }

    // Match by registration number first, then by name
    const productByReg = products.find((p) => p.NUM_REG === registrationNumber);
    const productByName = products.find(
      (p) => p.NOME_COMMERCIALE.toLowerCase() === productName.toLowerCase(),
    );
    const product = productByReg ?? productByName ?? products[0];
    const codProdotto = product.COD_PRODOTTO;

    // Step 2: Resolve crop ID
    const crops = await client.getColture();
    let crop = findBestDirectMatch(cropName, crops, (c) => c.NOME_COLTURA);

    if (!crop) {
      const resolvedCode = await resolveNameWithLlm(
        cropName,
        crops.map((c) => ({ code: String(c.ID_PV), name: c.NOME_COLTURA })),
        'colture agricole',
      );
      if (resolvedCode) {
        crop = crops.find((c) => String(c.ID_PV) === resolvedCode);
      }
    }

    if (!crop) {
      console.warn(`[BDF-ENRICH] Crop "${cropName}" not found in BDF`);
      return dosageDetails;
    }

    // Step 3: Resolve adversity codes and fetch doses
    const adversities = await client.getAvversita(crop.ID_PV);
    const allBdfDoses: BdfDose[] = [];

    // Collect disease names from dosageDetails to query BDF (only in enrichment mode)
    const diseases = [
      ...new Set(
        dosageDetails.map((d) => d.malattia).filter((m): m is string => m != null && m.length > 0),
      ),
    ];

    if (diseases.length > 0) {
      // Query BDF for each disease
      for (const disease of diseases) {
        let adversity = findBestDirectMatch(disease, adversities, (a) => a.NOME_ITA);

        if (!adversity) {
          const resolvedAdvCode = await resolveNameWithLlm(
            disease,
            adversities.map((a) => ({ code: a.COD_AVVERSITA, name: a.NOME_ITA })),
            'avversità/malattie della coltura',
          );
          if (resolvedAdvCode) {
            adversity = adversities.find((a) => a.COD_AVVERSITA === resolvedAdvCode);
          }
        }

        if (adversity) {
          const doses = await client.getDosi({
            codprod: codProdotto,
            coltura: crop.ID_PV,
            avversita: adversity.COD_AVVERSITA,
          });
          allBdfDoses.push(...doses);
        }
      }
    }

    // Fallback / Primary mode: try fetching doses across adversities for this product/crop
    if (allBdfDoses.length === 0 && adversities.length > 0) {
      const maxAdversities = isBdfPrimaryMode ? 15 : 5;
      const seenDoseIds = new Set<string>();
      for (const adv of adversities.slice(0, maxAdversities)) {
        try {
          const doses = await client.getDosi({
            codprod: codProdotto,
            coltura: crop.ID_PV,
            avversita: adv.COD_AVVERSITA,
          });
          if (doses.length > 0) {
            // Deduplicate doses by ID_DOSE
            for (const dose of doses) {
              const doseKey = String(
                dose.ID_DOSE ?? `${adv.COD_AVVERSITA}-${dose.DOSE_MIN}-${dose.DOSE_MAX}`,
              );
              if (!seenDoseIds.has(doseKey)) {
                seenDoseIds.add(doseKey);
                allBdfDoses.push(dose);
              }
            }
            if (!isBdfPrimaryMode) break; // In enrichment mode, first match is enough
          }
        } catch {
          // Continue trying other adversities
        }
      }
    }

    if (allBdfDoses.length === 0) {
      console.warn(
        `[BDF-ENRICH] No doses found in BDF for ${productName} on ${cropName}${isBdfPrimaryMode ? ' (primary mode)' : ''}`,
      );
      return dosageDetails;
    }

    // Step 4: Map BDF doses to LabelDoseDetail format
    const bdfDosaggi = allBdfDoses.map((d) => mapBdfDoseToLabelDoseDetail(d, cropName));

    // Mode B (primary source): return BDF doses directly - no label data to merge with
    if (isBdfPrimaryMode) {
      console.log(
        `[BDF-ENRICH] PRIMARY MODE: Created ${bdfDosaggi.length} dosageDetails from BDF for ${productName} on ${cropName}`,
      );
      return bdfDosaggi;
    }

    // Mode A (enrichment): merge - label extraction takes priority, BDF fills nulls
    console.log(
      `[BDF-ENRICH] Found ${bdfDosaggi.length} BDF doses for ${productName} on ${cropName}. Enriching ${dosageDetails.length} label details.`,
    );

    return dosageDetails.map((d) => {
      // Try to match by disease name first
      const bdfMatch =
        bdfDosaggi.find(
          (b) =>
            b.malattia != null &&
            d.malattia != null &&
            b.malattia.toLowerCase().includes(d.malattia.toLowerCase()),
        ) ?? bdfDosaggi[0]; // Fallback to first BDF match

      return mergeDosageDetail(d, bdfMatch);
    });
  } catch (err) {
    console.warn('[BDF-ENRICH] API call failed, continuing without enrichment:', err);
    return dosageDetails;
  }
}

/**
 * Builds a synthetic Label entirely from BDF data when SIAN fails to provide a PDF.
 * Used as fallback in crop matching when label extraction is not available.
 *
 * Returns null if BDF cannot find the product or no doses exist for the target crop.
 */
export async function buildBdfFallbackLabel(
  productName: string,
  registrationNumber: string,
  cropName: string,
): Promise<{ label: Label; bdfProduct: BdfProdotto } | null> {
  try {
    const client = createCachedBdfClient();

    // Step 1: Find product in BDF
    const cleanName = productName.replace(/[®™©]/g, '').trim();
    const products = await client.getProdotti({ ricalfa: cleanName });
    if (products.length === 0) {
      console.warn(`[BDF-FALLBACK] Product "${cleanName}" not found in BDF`);
      return null;
    }

    const cleanReg = registrationNumber.replace(/^0+/, '');
    const productByReg = products.find((p) => p.NUM_REG.replace(/^0+/, '') === cleanReg);
    const productByName = products.find(
      (p) => p.NOME_COMMERCIALE.toLowerCase() === cleanName.toLowerCase(),
    );
    const product = productByReg ?? productByName ?? products[0];

    // Step 2: Get detailed product data (TIPOLOGIA, FORMULAZIONE, etc.)
    let tipologia: string | null = null;
    let formulazione: string | null = null;
    try {
      const dati = await client.getProdottoDati(product.COD_PRODOTTO);
      if (dati.length > 0) {
        tipologia = dati[0].TIPOLOGIA;
        formulazione = dati[0].FORMULAZIONE;
      }
    } catch {
      // Non-critical, continue without detailed data
    }

    // Step 3: Resolve crop ID
    const crops = await client.getColture();
    let crop = findBestDirectMatch(cropName, crops, (c) => c.NOME_COLTURA);
    if (!crop) {
      const resolvedCode = await resolveNameWithLlm(
        cropName,
        crops.map((c) => ({ code: String(c.ID_PV), name: c.NOME_COLTURA })),
        'colture agricole',
      );
      if (resolvedCode) {
        crop = crops.find((c) => String(c.ID_PV) === resolvedCode);
      }
    }
    if (!crop) {
      console.warn(`[BDF-FALLBACK] Crop "${cropName}" not found in BDF for ${productName}`);
      return null;
    }

    // Step 4: Fetch doses across adversities to check authorization and get dose data
    const adversities = await client.getAvversita(crop.ID_PV);
    const allDoses: BdfDose[] = [];
    const matchedAdversityNames: string[] = [];
    const seenDoseIds = new Set<string>();

    for (const adv of adversities.slice(0, 15)) {
      try {
        const doses = await client.getDosi({
          codprod: product.COD_PRODOTTO,
          coltura: crop.ID_PV,
          avversita: adv.COD_AVVERSITA,
        });
        if (doses.length > 0) {
          matchedAdversityNames.push(adv.NOME_ITA);
          for (const dose of doses) {
            const doseKey = String(
              dose.ID_DOSE ?? `${adv.COD_AVVERSITA}-${dose.DOSE_MIN}-${dose.DOSE_MAX}`,
            );
            if (!seenDoseIds.has(doseKey)) {
              seenDoseIds.add(doseKey);
              allDoses.push(dose);
            }
          }
        }
      } catch {
        // Continue trying other adversities
      }
    }

    if (allDoses.length === 0) {
      console.warn(
        `[BDF-FALLBACK] No doses in BDF for ${productName} on ${cropName} — product may not be authorized`,
      );
      return null;
    }

    // Step 5: Build synthetic Label
    const activeIngredients = [product.SA1, product.SA2, product.SA3].filter(
      (sa): sa is string => sa != null && sa.length > 0,
    );

    const dosaggiDettagliati = allDoses.map((d) =>
      mapBdfDoseToLabelDoseDetail(d, crop!.NOME_COLTURA),
    );

    const label: Label = {
      prodotto: product.NOME_COMMERCIALE,
      categoria: tipologia,
      formulazione,
      principio_attivo: activeIngredients.join(' + ') || null,
      composizione: null,
      meccanismo_azione_frac: null,
      malattie: matchedAdversityNames,
      specie: [],
      colture_target: [crop.NOME_COLTURA],
      dosaggi_dettagliati: dosaggiDettagliati,
      fasce_di_rispetto_e_deriva: [],
      avvertenze: [],
      frasi_pericolo: [],
      frasi_prudenza: [],
      compatibilita: null,
      fitotossicita: null,
      note_tecniche: null,
      extraction_confidence: 70,
      extracted_fields: [
        'prodotto',
        'categoria',
        'principio_attivo',
        'colture_target',
        'dosaggi_dettagliati',
        'malattie',
      ],
      errors: ['Label built from BDF data (SIAN unavailable)'],
      numero_registrazione: product.NUM_REG,
    };

    console.log(
      `[BDF-FALLBACK] Built synthetic label for ${productName} (${registrationNumber}) on ${cropName}: ` +
        `${dosaggiDettagliati.length} doses, ${matchedAdversityNames.length} adversities, ` +
        `SA: ${activeIngredients.join(', ') || 'N/A'}`,
    );

    return { label, bdfProduct: product };
  } catch (err) {
    console.warn(`[BDF-FALLBACK] Failed to build label from BDF for ${productName}:`, err);
    return null;
  }
}
