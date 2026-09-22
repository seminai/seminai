import { LabelDoseDetail } from '../../../../domain/dtos/label.dto';
import { createCachedBdfClient, findBestDirectMatch, resolveNameWithLlm, type BdfDose } from '../../integrations/bdf';
import { mapBdfDoseToLabelDoseDetail, mergeDosageDetail, needsEnrichment } from './bdfDosageEnricher.part-01-critical-fields';

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
