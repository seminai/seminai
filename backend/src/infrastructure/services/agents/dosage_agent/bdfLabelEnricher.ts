/**
 * BDF Label Enricher
 *
 * When the LLM extracts a label but leaves critical fields empty/null,
 * this module queries the BDF API to fill in the gaps.
 * Extracted data always takes priority — BDF only fills what is missing.
 *
 * Enrichable fields: principio_attivo, categoria, formulazione,
 * colture_target, malattie, dosaggi_dettagliati, composizione,
 * numero_registrazione.
 *
 * If BDF API fails at any step the original label is returned unchanged.
 */

import { Label } from '../../../../domain/dtos/label.dto';
import {
  createCachedBdfClient,
  findBestDirectMatch,
  resolveNameWithLlm,
  type BdfDose,
  type BdfProdotto,
} from '../../integrations/bdf';
import { mapBdfDoseToLabelDoseDetail } from './bdfDosageEnricher';

interface EnrichmentResult {
  readonly label: Label;
  readonly enrichedFields: readonly string[];
}

/**
 * Returns true when any critical label field is missing or empty.
 * Used to decide whether to call the BDF API for enrichment.
 */
export function labelNeedsBdfEnrichment(label: Label): boolean {
  if (!label.principio_attivo) return true;
  if (!label.categoria) return true;
  if (!label.formulazione) return true;
  if (!label.colture_target?.length) return true;
  if (!label.malattie?.length) return true;
  if (!label.dosaggi_dettagliati?.length) return true;
  return false;
}

function resolveBdfProduct(
  products: ReadonlyArray<BdfProdotto>,
  productName: string,
  registrationNumber: string,
): BdfProdotto {
  const cleanReg = registrationNumber.replace(/^0+/, '');
  const byReg = products.find((p) => p.NUM_REG.replace(/^0+/, '') === cleanReg);
  const byName = products.find(
    (p) => p.NOME_COMMERCIALE.toLowerCase() === productName.toLowerCase(),
  );
  return byReg ?? byName ?? products[0];
}

function formatComposition(
  items: ReadonlyArray<{
    DECODIFICA: string;
    PERCENTUALE: number | null;
    GRAMMI_LITRO: number | null;
  }>,
): string {
  return items
    .map((c) => {
      const pct = c.PERCENTUALE != null ? `${c.PERCENTUALE}%` : null;
      const gl = c.GRAMMI_LITRO != null ? `${c.GRAMMI_LITRO} g/L` : null;
      const detail = [pct, gl].filter(Boolean).join(' — ');
      return detail ? `${c.DECODIFICA} (${detail})` : c.DECODIFICA;
    })
    .join(', ');
}

/**
 * Enriches a partially-extracted label by filling null/empty critical
 * fields from the BDF API. Extracted (LLM) data always takes priority.
 *
 * @param cropName - when provided, enables crop-specific enrichment
 *   (malattie, dosaggi_dettagliati)
 */
export async function enrichLabelFromBdf(
  label: Label,
  registrationNumber: string,
  productName: string,
  cropName?: string,
): Promise<EnrichmentResult> {
  if (!labelNeedsBdfEnrichment(label)) {
    return { label, enrichedFields: [] };
  }

  try {
    const client = createCachedBdfClient();
    const cleanName = productName.replace(/[®™©]/g, '').trim();
    const products = await client.getProdotti({ ricalfa: cleanName });
    if (products.length === 0) {
      console.warn(`[BDF-LABEL-ENRICH] Product "${cleanName}" not found in BDF`);
      return { label, enrichedFields: [] };
    }

    const product = resolveBdfProduct(products, cleanName, registrationNumber);
    const enrichedFields: string[] = [];

    let bdfCategoria: string | null = null;
    let bdfFormulazione: string | null = null;
    if (!label.categoria || !label.formulazione) {
      try {
        const dati = await client.getProdottoDati(product.COD_PRODOTTO);
        if (dati.length > 0) {
          bdfCategoria = dati[0].TIPOLOGIA;
          bdfFormulazione = dati[0].FORMULAZIONE;
        }
      } catch {
        /* non-critical */
      }
    }

    let bdfPrincipioAttivo: string | null = null;
    if (!label.principio_attivo) {
      const sas = [product.SA1, product.SA2, product.SA3].filter(
        (sa): sa is string => sa != null && sa.length > 0,
      );
      bdfPrincipioAttivo = sas.length > 0 ? sas.join(' + ') : null;
    }

    let bdfComposizione: string | null = null;
    if (!label.composizione) {
      try {
        const comp = await client.getComposizione(product.COD_PRODOTTO);
        if (comp.length > 0) {
          bdfComposizione = formatComposition(comp);
        }
      } catch {
        /* non-critical */
      }
    }

    let bdfColtureTarget: string[] = [];
    if (!label.colture_target?.length) {
      try {
        const impieghi = await client.getImpieghi(product.COD_PRODOTTO);
        bdfColtureTarget = [...new Set(impieghi.map((i) => i.NOME).filter(Boolean))];
      } catch {
        /* non-critical */
      }
    }

    let bdfMalattie: string[] = [];
    let bdfDosaggiDettagliati: Label['dosaggi_dettagliati'] = [];
    if (cropName && (!label.malattie?.length || !label.dosaggi_dettagliati?.length)) {
      const cropDoseResult = await fetchCropDosesFromBdf(client, product.COD_PRODOTTO, cropName);
      if (cropDoseResult) {
        if (!label.malattie?.length) bdfMalattie = [...cropDoseResult.adversityNames];
        if (!label.dosaggi_dettagliati?.length) {
          bdfDosaggiDettagliati = cropDoseResult.doses.map((d) =>
            mapBdfDoseToLabelDoseDetail(d, cropDoseResult.cropLabel),
          );
        }
      }
    }

    if (!label.principio_attivo && bdfPrincipioAttivo) enrichedFields.push('principio_attivo');
    if (!label.categoria && bdfCategoria) enrichedFields.push('categoria');
    if (!label.formulazione && bdfFormulazione) enrichedFields.push('formulazione');
    if (!label.composizione && bdfComposizione) enrichedFields.push('composizione');
    if (!label.colture_target?.length && bdfColtureTarget.length > 0)
      enrichedFields.push('colture_target');
    if (!label.malattie?.length && bdfMalattie.length > 0) enrichedFields.push('malattie');
    if (!label.dosaggi_dettagliati?.length && bdfDosaggiDettagliati.length > 0)
      enrichedFields.push('dosaggi_dettagliati');
    if (!label.numero_registrazione && product.NUM_REG) enrichedFields.push('numero_registrazione');

    if (enrichedFields.length === 0) {
      return { label, enrichedFields: [] };
    }

    const enrichedLabel: Label = {
      ...label,
      principio_attivo: label.principio_attivo ?? bdfPrincipioAttivo,
      categoria: label.categoria ?? bdfCategoria,
      formulazione: label.formulazione ?? bdfFormulazione,
      composizione: label.composizione ?? bdfComposizione,
      colture_target: label.colture_target?.length ? label.colture_target : bdfColtureTarget,
      malattie: label.malattie?.length ? label.malattie : bdfMalattie,
      dosaggi_dettagliati: label.dosaggi_dettagliati?.length
        ? label.dosaggi_dettagliati
        : bdfDosaggiDettagliati,
      numero_registrazione: label.numero_registrazione ?? product.NUM_REG,
      errors: [...label.errors, `Campi arricchiti da BDF: ${enrichedFields.join(', ')}`],
    };

    console.log(
      `[BDF-LABEL-ENRICH] Enriched ${enrichedFields.length} fields for ${productName}: ${enrichedFields.join(', ')}`,
    );

    return { label: enrichedLabel, enrichedFields };
  } catch (err) {
    console.warn(
      `[BDF-LABEL-ENRICH] Failed for ${productName}:`,
      err instanceof Error ? err.message : err,
    );
    return { label, enrichedFields: [] };
  }
}

interface CropDoseResult {
  readonly doses: readonly BdfDose[];
  readonly adversityNames: readonly string[];
  readonly cropLabel: string;
}

async function fetchCropDosesFromBdf(
  client: ReturnType<typeof createCachedBdfClient>,
  codProdotto: string,
  cropName: string,
): Promise<CropDoseResult | null> {
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

  if (!crop) return null;

  const adversities = await client.getAvversita(crop.ID_PV);
  const allDoses: BdfDose[] = [];
  const matchedNames: string[] = [];
  const seenIds = new Set<string>();

  for (const adv of adversities.slice(0, 15)) {
    try {
      const doses = await client.getDosi({
        codprod: codProdotto,
        coltura: crop.ID_PV,
        avversita: adv.COD_AVVERSITA,
      });
      if (doses.length > 0) {
        matchedNames.push(adv.NOME_ITA);
        for (const dose of doses) {
          const key = String(
            dose.ID_DOSE ?? `${adv.COD_AVVERSITA}-${dose.DOSE_MIN}-${dose.DOSE_MAX}`,
          );
          if (!seenIds.has(key)) {
            seenIds.add(key);
            allDoses.push(dose);
          }
        }
      }
    } catch {
      /* continue */
    }
  }

  if (allDoses.length === 0) return null;

  return { doses: allDoses, adversityNames: matchedNames, cropLabel: crop.NOME_COLTURA };
}
