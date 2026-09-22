import { describe, it, expect } from "vitest";
import {
  CATEGORIE_OPTIONS,
  CATEGORY_TO_EXTRACTION_MAP,
  DOCUMENT_CATEGORY_TO_SLUG,
  LIKELY_PRODUCTION_UNITS_CATEGORIES,
  getCategoryOptionsForCompanyKind,
  getCategoryOptionsForKind,
} from "./upload-options";

/** The 11 BE `DocumentCategory` enum values (mirror of seminai-be-v2 schema.prisma). */
const BE_DOCUMENT_CATEGORIES = [
  "DDT",
  "DISCIPLINARE",
  "FASCICOLO_AZIENDALE",
  "FATTURA",
  "MAGAZZINO",
  "ETICHETTA",
  "VISURA_AZIENDALE",
  "NOTA",
  "PIANO_COLTURALE",
  "CERTIFICAZIONE",
  "ALTRO",
] as const;

describe("DOCUMENT_CATEGORY_TO_SLUG", () => {
  const validSlugs = new Set<string>(
    CATEGORIE_OPTIONS.map((option) => option.value),
  );

  it("maps every BE document category to a slug present in CATEGORIE_OPTIONS", () => {
    for (const category of BE_DOCUMENT_CATEGORIES) {
      const slug = DOCUMENT_CATEGORY_TO_SLUG[category];
      expect(slug, `missing slug for ${category}`).toBeDefined();
      expect(
        validSlugs.has(slug),
        `slug "${slug}" not in CATEGORIE_OPTIONS`,
      ).toBe(true);
    }
  });

  it("does not map to any unknown category", () => {
    expect(Object.keys(DOCUMENT_CATEGORY_TO_SLUG).sort()).toEqual(
      [...BE_DOCUMENT_CATEGORIES].sort(),
    );
  });
});

describe("getCategoryOptionsForKind", () => {
  const MANUFACTURING_VALUES = ["ddt", "fattura", "magazzino", "altro"];
  const values = (opts: ReadonlyArray<{ value: string }>) => opts.map((o) => o.value);

  it("returns only the manufacturing subset for a MANUFACTURING company", () => {
    expect(values(getCategoryOptionsForKind("MANUFACTURING")).sort()).toEqual(
      [...MANUFACTURING_VALUES].sort(),
    );
  });

  it("returns all categories for an AGRICULTURAL company", () => {
    expect(getCategoryOptionsForKind("AGRICULTURAL")).toEqual(CATEGORIE_OPTIONS);
  });

  it("falls back to the workspace kind when no company kind (MANUFACTURING workspace → subset)", () => {
    expect(values(getCategoryOptionsForKind(undefined, "MANUFACTURING")).sort()).toEqual(
      [...MANUFACTURING_VALUES].sort(),
    );
  });

  it("returns all categories when no company kind and the workspace is agricultural/null", () => {
    expect(getCategoryOptionsForKind(undefined, "AGRICULTURAL")).toEqual(CATEGORIE_OPTIONS);
    expect(getCategoryOptionsForKind(undefined, null)).toEqual(CATEGORIE_OPTIONS);
    expect(getCategoryOptionsForKind(undefined, undefined)).toEqual(CATEGORIE_OPTIONS);
  });

  it("back-compat: getCategoryOptionsForCompanyKind(undefined) returns all categories", () => {
    expect(getCategoryOptionsForCompanyKind(undefined)).toEqual(CATEGORIE_OPTIONS);
  });
});

describe("piano-colturale upload routing", () => {
  it("sends crop plan files to the backend agricultural resolver without opening the PU wizard", () => {
    expect(CATEGORY_TO_EXTRACTION_MAP["piano-colturale"]).toBe(
      "agricultural",
    );
    expect(LIKELY_PRODUCTION_UNITS_CATEGORIES).not.toContain("piano-colturale");
  });
});
