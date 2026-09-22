/**
 * Unified rules for normalizing product names extracted from invoices and DDTs.
 *
 * Policy (applied to BOTH invoice and DDT pipelines):
 * 1. Strip leading article/SKU codes (e.g. "XSER030S - ").
 * 2. Strip obvious invoice-only suffixes (pure numeric codes, "-clp" variants,
 *    trailing administrative tokens like "N", "COD", "ART", "REF").
 * 3. KEEP the packaging descriptor when present (e.g. "1 L", "KG.5", "LT.10",
 *    "saccone KG.25"). The commercial name without packaging is too ambiguous
 *    for registry lookup, and the FE shows it under `productNameExtracted`.
 * 4. Collapse repeated whitespace and trim.
 *
 * The heavier parsing / splitting (baseName vs packaging) lives in
 * `ProductNameParser.parseProductName`. Those functions are still used by the
 * controllers for stock matching. This module is the shared *pre-LLM* guidance
 * that both prompts reference via getProductNameNormalizationInstructions().
 */

const LEADING_CODE_REGEX = /^[A-Z0-9]{3,}\s*-\s*/;
const TRAILING_ADMIN_TOKENS_REGEX = /\s+(?:N|COD|ART|REF)[A-Z0-9]*\d[A-Z0-9]*$/i;
const TRAILING_CLP_REGEX = /\s*-?\s*clp\s*-?\s*$/i;
/**
 * DDT reference that some invoices print as the first line of the description
 * cell (e.g. "D.d.T. N. 2948 Del: 03/06/25 UREA GRANULARE M"). The reference
 * is document metadata, not part of the product name.
 */
const LEADING_DDT_REFERENCE_REGEX =
  /^D\.?d\.?t\.?\s*N\.?\s*[A-Z0-9\/\-]+\s*(?:Del|Data\s*Tra)\s*:?\s*[0-9]{2}\/[0-9]{2}\/[0-9]{2,4}\s*/i;
/**
 * "Rif DT n.XXX del DD/MM/YY" section header used by some Italian suppliers
 * (e.g. Roverso Paolo) to group invoice rows by their source DDT. The OCR
 * frequently merges these section markers into the product descrizione cell
 * — either as a multi-line cell ("Rif DT n.1872 del 04/04/25\nCONC.ACTIVE
 * LAND PLUS...") or inline before/after the real product name. The marker is
 * document metadata, never a product. Global flag so we strip every
 * occurrence inside the cell.
 */
const RIF_DT_REFERENCE_REGEX =
  /Rif\.?\s*D\.?\s*T\.?\s*n\.?\s*\d+(?:\s+del\s+\d{1,2}\/\d{1,2}\/\d{2,4})?/gi;
/**
 * "COPIA STAMPATA DI FATTURA ELETTRONICA, NON VALIDA AI FINI FISCALI."
 * boilerplate footer that OCR sometimes absorbs into the last product's
 * descrizione cell. Strip it so the productName keeps only the real product.
 */
const COPIA_STAMPATA_REGEX =
  /COPIA\s+STAMPATA\s+DI\s+FATTURA\s+ELETTRONICA[,\s]*NON\s+VALIDA\s+AI\s+FINI\s+FISCALI\.?/gi;
/**
 * Italian phytosanitary DDTs (Phyto Service and similar) print an ADR/
 * dangerous-goods classification BELOW the commercial product name in the
 * same description cell. OCR sometimes shifts that line onto the NEXT
 * product, producing strings like:
 *   "UN 3077 MATERIA PERICOLOSA PER L'AMBSOLIDA NAS (RAME) 9, III(E)PERICOLOSO PER L'AMBIENTE ALTACOR DA KG 0,1"
 *   "UN3082 MATERIA PERICOLOSA PER L'AMBIENTELIQUIDA, N.O.S., (Fenpyroximate), 9, III EXECUTIVE GOLD DA GR 100"
 *   "UN 3265 LIQUIDO ORGANICO CORROSIVOACIDO NAS (ETEFON) 8, III MATACAR FL DA LT 0,2"
 * Strip the ADR prefix when followed by a recognizable commercial name
 * pattern (uppercase brand + "DA" + unit).
 */
const LEADING_ADR_UN_REGEX =
  /^UN\s*\d{3,4}\b[\s\S]*?(?:PERICOLOS[OA]\s+PER\s+L'?AMBIENTE|INQUINANTE\s+MARINO\s*[\/,]?\s*PERICOLOS[OA]\s+PER|INQUINANTE\s+MARINO|\b[I]{1,3}\b)\s+(?=[A-Z][A-Z]+(?:\s+[A-Z]+)*\s+DA\s+(?:KG|GR|G|T|Q|LT|L|ML|NR|PZ|CF|SC|CT|CN)\b)/;

/**
 * Applies the shared deterministic normalization to a raw product name.
 * Keeps packaging descriptors intact.
 */
export function normalizeProductName(rawName: string): string {
  if (!rawName) return '';
  let cleaned = rawName.replace(/\r?\n/g, ' ').trim();
  cleaned = cleaned.replace(COPIA_STAMPATA_REGEX, ' ').trim();
  cleaned = cleaned.replace(RIF_DT_REFERENCE_REGEX, ' ').trim();
  cleaned = cleaned.replace(LEADING_ADR_UN_REGEX, '').trim();
  cleaned = cleaned.replace(LEADING_DDT_REFERENCE_REGEX, '').trim();
  cleaned = cleaned.replace(LEADING_CODE_REGEX, '').trim();
  cleaned = cleaned.replace(TRAILING_ADMIN_TOKENS_REGEX, '').trim();
  cleaned = cleaned.replace(TRAILING_CLP_REGEX, '').trim();
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();
  while (cleaned.length > 0 && (cleaned.endsWith('-') || cleaned.endsWith('.'))) {
    cleaned = cleaned.slice(0, -1).trim();
  }
  return cleaned;
}

/**
 * Detects whether a raw descrizione cell is ONLY a "Rif DT n.XXX del DD/MM/YY"
 * section header (i.e. it contains the marker and nothing else once the noise
 * tokens are removed). Such rows are NOT products — they appear in the OCR
 * markdown because the OCR misinterpreted the visual section divider as a
 * data row. The table-normalizer uses this to discard them.
 */
export function isSectionHeaderOnlyDescription(rawDescription: string): boolean {
  if (!rawDescription) return false;
  if (!/Rif\.?\s*D\.?\s*T\.?\s*n\.?\s*\d+/i.test(rawDescription)) return false;
  return stripSectionHeaderMarkers(rawDescription).length === 0;
}

/**
 * Strips section-header noise (Rif DT references, COPIA STAMPATA footer) and
 * collapses newlines/whitespace, without applying the heavier
 * productName-normalization (which strips leading SKU codes etc.). Used by the
 * table-normalizer to clean cells before they reach the LLM, so the structured
 * rows handed to GPT-4o no longer contain "Rif DT n.XXX del DD/MM/YY"
 * fragments mixed inline with real product descriptions.
 */
export function stripSectionHeaderMarkers(rawDescription: string): string {
  if (!rawDescription) return '';
  return rawDescription
    .replace(/\r?\n/g, ' ')
    .replace(COPIA_STAMPATA_REGEX, ' ')
    .replace(RIF_DT_REFERENCE_REGEX, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Shared prompt instructions that both the Invoice and DDT extraction LLM
 * calls inject into their system message. Keeping them in a single source of
 * truth avoids the previous divergence (invoice asked to keep packaging, DDT
 * asked to strip it).
 */
export const PRODUCT_NAME_PROMPT_INSTRUCTIONS = `PRODUCT NAME RULES (SHARED between invoice and DDT):
- Preserve the commercial product name exactly as printed, INCLUDING any packaging/weight descriptor (e.g. "SERCADIS SC 1 L", "CONCIME AMMONIO 25 KG", "ZYPAR LT.1").
- Do NOT strip size, weight, litre/kg/gr specifications or "saccone KG.25" style suffixes.
- Do NOT include the article/SKU code that often prefixes the description (e.g. "XSER030S -", "KSE0820 -").
- Do NOT include trailing administrative tokens such as "N", "COD", "ART", "REF".
- When the description cell starts with a DDT reference ("D.d.T. N. 2948 Del: 03/06/25 UREA GRANULARE M"), that prefix is the DDT reference (orderNumber / metadata), NOT part of the product name. Set productName to just "UREA GRANULARE M" and put the DDT number into orderNumber (on DDT extraction) or drop it (on invoice extraction).
- If the description cell contains ONLY a DDT reference and no actual product (e.g. "D.d.T. N. 994 Del: 01/04/25" by itself), skip that row entirely — it is not a product line.
- "Rif DT n.XXX del DD/MM/YY" markers (e.g. "Rif DT n.763 del 01/03/25") are SECTION HEADERS used by Italian suppliers (Roverso Paolo and similar) to group invoice rows by their source delivery note. Treat them as DDT references: strip them from the productName, even when they appear in the middle or end of a multi-line cell. If a row's descrizione cell is ONLY such a marker, skip the row entirely.
- "COPIA STAMPATA DI FATTURA ELETTRONICA, NON VALIDA AI FINI FISCALI." is invoice footer boilerplate that OCR sometimes merges into the last product's descrizione. Strip it from productName.
- If the description starts with an ADR/UN dangerous-goods classification ("UN 3077 MATERIA PERICOLOSA...", "UN3082 MATERIA PERICOLOSA...", "UN 3265 LIQUIDO ORGANICO..."), strip that prefix entirely — it is the dangerous-goods classification of the PREVIOUS row, not part of this product's name. Keep only the commercial brand name + packaging (e.g. "ALTACOR DA KG 0,1", "EXECUTIVE GOLD DA GR 100").
- Keep the original casing when possible.`;
