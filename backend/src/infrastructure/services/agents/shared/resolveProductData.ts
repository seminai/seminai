import {
  createCachedBdfClient,
  findBestDirectMatch,
  resolveNameWithLlm,
  type BdfAvversita,
  type BdfDose,
  type CachedBdfClient,
} from '../../integrations/bdf';
import {
  mergeLabelExtras,
  tryCsvDataset,
  tryDbLabel,
  tryEnsureLabel,
} from './resolveProductData.label-tiers';

/**
 * Source that ultimately answered a product-data resolution.
 *
 * NOTE: the ordering here is BDF-FIRST (bdf → label_db → SIAN scraping → csv),
 * which is the OPPOSITE of the sibling {@link resolveProductCrops} (label_db-first).
 * The divergence is intentional: product/active-ingredient recommendation starts
 * from BDF's authorized-products list (the only source able to answer
 * "which products treat avversità X on crop Y"), so BDF data is already the most
 * authoritative in-hand source. Richer label-only fields (FRAC, water buffers) are
 * back-filled into null slots on a BDF hit without overriding BDF values.
 */
export type ProductDataSource =
  | 'bdf'
  | 'label_db'
  | 'fito_extracted'
  | 'fertilizer_extracted'
  | 'csv_dataset'
  | 'none';

export interface ProductActiveIngredient {
  readonly name: string;
  readonly fracMoa?: string | null;
  readonly bio?: boolean;
}

export interface ProductDoseInfo {
  readonly coltura: string;
  readonly malattia?: string | null;
  readonly dose_minima?: number | null;
  readonly dose_massima?: number | null;
  readonly dose_um?: string | null;
  readonly n_max_applicazioni?: number | null;
  /** Pre-harvest interval (carenza) in days. */
  readonly intervallo_sicurezza_giorni?: number | null;
}

export interface ProductDataResolution {
  readonly productName: string;
  readonly registrationNumber: string;
  readonly activeIngredients: ReadonlyArray<ProductActiveIngredient>;
  readonly category: string | null;
  readonly bio: boolean | null;
  readonly revoked: boolean | null;
  readonly doses: ReadonlyArray<ProductDoseInfo>;
  readonly meccanismo_azione_frac: string | null;
  readonly fasce_rispetto_acqua: string | null;
  readonly source: ProductDataSource;
}

export interface ResolveProductDataParams {
  readonly productName: string;
  readonly registrationNumber?: string;
  readonly cropName?: string;
  readonly adversityName?: string;
  /** When false, skips the slow on-demand SIAN scraping tier. Default true. */
  readonly allowScraping?: boolean;
}

const NONE = (name: string, reg: string): ProductDataResolution => ({
  productName: name,
  registrationNumber: reg,
  activeIngredients: [],
  category: null,
  bio: null,
  revoked: null,
  doses: [],
  meccanismo_azione_frac: null,
  fasce_rispetto_acqua: null,
  source: 'none',
});

/**
 * Resolves product data (active ingredients + doses + metadata) via a BDF-first
 * waterfall: BDF API → LabelExtraction DB → on-demand SIAN scraping → CSV dataset.
 * Each tier degrades gracefully (logs + falls through) on error.
 */
export async function resolveProductData(
  params: ResolveProductDataParams,
): Promise<ProductDataResolution> {
  const name = (params.productName ?? '').trim();
  const regNum = (params.registrationNumber ?? '').trim();
  const allowScraping = params.allowScraping ?? true;

  const fromBdf = await tryBdfData(name, regNum, params.cropName, params.adversityName);
  if (fromBdf) return mergeLabelExtras(fromBdf, name, regNum);

  const fromDb = await tryDbLabel(name, regNum, params.cropName);
  if (fromDb) return fromDb;

  if (allowScraping) {
    const fromEnsure = await tryEnsureLabel(name, regNum, params.cropName);
    if (fromEnsure) return fromEnsure;
  }

  const fromCsv = await tryCsvDataset(name, regNum, params.cropName);
  if (fromCsv) return fromCsv;

  return NONE(name, regNum);
}

async function tryBdfData(
  name: string,
  regNum: string,
  cropName?: string,
  adversityName?: string,
): Promise<ProductDataResolution | null> {
  const baseUrl = process.env.URL_SERVER_BDF;
  if (!baseUrl || !process.env.USERNAME_BDF || !process.env.PASSWORD_BDF || name.length < 3) {
    return null;
  }
  try {
    const client = createCachedBdfClient();
    const cleanName = name.replace(/[®™©]/g, '').trim();
    const products = await client.getProdotti({ ricalfa: cleanName });
    if (products.length === 0) return null;

    const byReg = regNum
      ? products.find((p) => p.NUM_REG.replace(/^0+/, '') === regNum.replace(/^0+/, ''))
      : undefined;
    const byName = products.find(
      (p) => p.NOME_COMMERCIALE.toLowerCase() === cleanName.toLowerCase(),
    );
    const product = byReg ?? byName ?? products[0];

    const activeIngredients: ProductActiveIngredient[] = [product.SA1, product.SA2, product.SA3]
      .filter((sa): sa is string => sa != null && sa.length > 0)
      .map((sa) => ({ name: sa, bio: product.BIO }));

    let category: string | null = null;
    try {
      const dati = await client.getProdottoDati(product.COD_PRODOTTO);
      if (dati.length > 0) category = dati[0].TIPOLOGIA ?? dati[0].FORMULAZIONE ?? null;
    } catch {
      /* non-critical */
    }

    const doses = cropName
      ? await fetchBdfDoses(client, product.COD_PRODOTTO, cropName, adversityName)
      : [];

    return {
      productName: product.NOME_COMMERCIALE,
      registrationNumber: product.NUM_REG || regNum,
      activeIngredients,
      category,
      bio: product.BIO,
      revoked: product.REVOCATO,
      doses,
      meccanismo_azione_frac: null,
      fasce_rispetto_acqua: null,
      source: 'bdf',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown BDF error';
    console.warn(`[resolveProductData] BDF lookup failed for "${name}": ${msg}`);
    return null;
  }
}

async function fetchBdfDoses(
  client: CachedBdfClient,
  codProdotto: string,
  cropName: string,
  adversityName?: string,
): Promise<ProductDoseInfo[]> {
  const crops = await client.getColture();
  let crop = findBestDirectMatch(cropName, crops, (c) => c.NOME_COLTURA);
  if (!crop) {
    const code = await resolveNameWithLlm(
      cropName,
      crops.map((c) => ({ code: String(c.ID_PV), name: c.NOME_COLTURA })),
      'colture agricole',
    );
    if (code) crop = crops.find((c) => String(c.ID_PV) === code);
  }
  if (!crop) return [];

  const adversities = await client.getAvversita(crop.ID_PV);
  const targets: BdfAvversita[] = [];
  if (adversityName) {
    let adv = findBestDirectMatch(adversityName, adversities, (a) => a.NOME_ITA);
    if (!adv) {
      const code = await resolveNameWithLlm(
        adversityName,
        adversities.map((a) => ({ code: a.COD_AVVERSITA, name: a.NOME_ITA })),
        'avversità/malattie della coltura',
      );
      if (code) adv = adversities.find((a) => a.COD_AVVERSITA === code);
    }
    if (adv) targets.push(adv);
  } else {
    targets.push(...adversities.slice(0, 8));
  }

  const seen = new Set<string>();
  const out: ProductDoseInfo[] = [];
  for (const adv of targets) {
    try {
      const doses = await client.getDosi({
        codprod: codProdotto,
        coltura: crop.ID_PV,
        avversita: adv.COD_AVVERSITA,
      });
      for (const d of doses) {
        const key = String(d.ID_DOSE ?? `${adv.COD_AVVERSITA}-${d.DOSE_MIN}-${d.DOSE_MAX}`);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(mapBdfDose(d, crop.NOME_COLTURA));
      }
    } catch {
      /* try next adversity */
    }
  }
  return out;
}

function mapBdfDose(d: BdfDose, cropName: string): ProductDoseInfo {
  return {
    coltura: d.NOME_SCI || cropName,
    malattia: d.NOME_ITA,
    dose_minima: d.DOSE_MIN,
    dose_massima: d.DOSE_MAX,
    dose_um: d.DECO_UM_DOSE,
    n_max_applicazioni: d.NUM_MAX_INT,
    intervallo_sicurezza_giorni: d.CARENZA != null && d.CARENZA !== 999 ? d.CARENZA : null,
  };
}

export function describeProductDataSource(source: ProductDataSource): string {
  switch (source) {
    case 'bdf':
      return 'BDF';
    case 'label_db':
      return 'Etichetta DB';
    case 'fito_extracted':
      return 'Etichetta SIAN (estratta on-demand)';
    case 'fertilizer_extracted':
      return 'Scheda fertilizzante (estratta on-demand)';
    case 'csv_dataset':
      return 'Dataset BDF locale (potrebbe essere obsoleto)';
    case 'none':
      return 'Nessuna fonte';
  }
}
