import { Label } from '../../../../domain/dtos/label.dto';
import { createCachedBdfClient, findBestDirectMatch, resolveNameWithLlm, type BdfDose, type BdfProdotto } from '../../integrations/bdf';
import { mapBdfDoseToLabelDoseDetail } from './bdfDosageEnricher.part-01-critical-fields';

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
