import type { BatchExtractionCategory } from "@/types/extraction";
import type { CompanyKind } from "@/types/company-kind";
import { isAgriculturalCompany } from "@/types/company-kind";
import type { WorkspaceKind } from "@/types/workspace";
import { isManufacturingWorkspace } from "@/types/workspace";

export interface CompanyOption {
  readonly value: string;
  readonly label: string;
  readonly kind?: CompanyKind;
}

/** Fallback — prefer real companies from useGetCompanies(). */
export const AZIENDE_OPTIONS: readonly CompanyOption[] = [
  { value: "az-rossi", label: "Az. Agricola Rossi" },
  { value: "verdissima", label: "Verdissima Az." },
  { value: "bellettini", label: "Az. Bellettini" },
] as const;

export const CATEGORIE_OPTIONS = [
  { value: "ddt", label: "DDT" },
  { value: "disciplinare", label: "Disciplinare" },
  { value: "fascicolo", label: "Fascicolo Aziendale" },
  { value: "fattura", label: "Fattura" },
  { value: "magazzino", label: "Magazzino" },
  { value: "etichetta", label: "Etichetta" },
  { value: "altro", label: "Altro" },
  { value: "visura", label: "Visura Aziendale" },
  { value: "nota", label: "Nota" },
  { value: "piano-colturale", label: "Piano Colturale" },
  { value: "certificazione", label: "Certificazione" },
] as const;

/**
 * Maps BE `DocumentCategory` enum values to FE category slugs (the inverse of the
 * 11 `CATEGORIE_OPTIONS`). Used to pre-fill the CATEGORIA select from
 * pre-classification suggestions.
 */
export const DOCUMENT_CATEGORY_TO_SLUG: Record<string, string> = {
  DDT: "ddt",
  DISCIPLINARE: "disciplinare",
  FASCICOLO_AZIENDALE: "fascicolo",
  FATTURA: "fattura",
  MAGAZZINO: "magazzino",
  ETICHETTA: "etichetta",
  VISURA_AZIENDALE: "visura",
  NOTA: "nota",
  PIANO_COLTURALE: "piano-colturale",
  CERTIFICAZIONE: "certificazione",
  ALTRO: "altro",
} as const;

/** Maps FE category values to BE extraction categories. */
export const CATEGORY_TO_EXTRACTION_MAP: Record<
  string,
  BatchExtractionCategory
> = {
  ddt: "ddt",
  fattura: "invoice",
  "piano-colturale": "agricultural",
  visura: "auto",
  fascicolo: "auto",
  disciplinare: "auto",
  nota: "auto",
  certificazione: "auto",
} as const;

const MANUFACTURING_CATEGORY_VALUES = new Set([
  "ddt",
  "fattura",
  "magazzino",
  "altro",
]);

/**
 * Resolves the upload categories for the active context. The company kind wins
 * when known (workspace↔company homogeneity guarantees it matches the workspace);
 * otherwise it falls back to the workspace kind so the manufacturing subset
 * applies even before a company is selected. Agricultural / `null` → full list.
 */
export function getCategoryOptionsForKind(
  companyKind?: CompanyKind,
  workspaceKind?: WorkspaceKind | null,
) {
  const manufacturing = companyKind
    ? !isAgriculturalCompany(companyKind)
    : isManufacturingWorkspace(workspaceKind);
  if (!manufacturing) {
    return CATEGORIE_OPTIONS;
  }
  return CATEGORIE_OPTIONS.filter((option) =>
    MANUFACTURING_CATEGORY_VALUES.has(option.value),
  );
}

/** Back-compat: company-kind-only resolution (no workspace fallback). */
export function getCategoryOptionsForCompanyKind(kind?: CompanyKind) {
  return getCategoryOptionsForKind(kind, undefined);
}

export const MAX_FILE_SIZE_MB = 256;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

/**
 * FE categories whose uploads are EXPECTED to produce a `production_units`
 * extraction. When a batch is composed exclusively of these categories, the
 * upload layout skips the archive and routes the user straight to the
 * production-units bulk form prefilled with the extracted drafts.
 */
export const LIKELY_PRODUCTION_UNITS_CATEGORIES: readonly string[] = [
  "fascicolo",
] as const;
