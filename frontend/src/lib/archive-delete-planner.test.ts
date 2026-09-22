import { describe, expect, it } from "vitest";
import { planArchiveDeletion } from "./archive-delete-planner";
import type {
  ArchiveRow,
  EntityArchiveRow,
  ExtractionArchiveRow,
} from "@/types/extraction";

const baseEntity = {
  titolo: "Campi",
  azienda: "Azienda test",
  aggiornato: "01/01/2026",
  aggiornatoIso: "2026-01-01T00:00:00.000Z",
  status: "Generato",
  tipoDiFile: "Lista",
  formato: "-",
  note: "-",
  kind: "entity",
  companyId: "company-1",
} satisfies Omit<EntityArchiveRow, "id" | "entityType">;

const baseExtraction = {
  titolo: "file.pdf",
  azienda: "Azienda test",
  aggiornato: "01/01/2026",
  aggiornatoIso: "2026-01-01T00:00:00.000Z",
  status: "Confermato",
  tipoDiFile: "Fattura",
  formato: ".pdf",
  note: "-",
  kind: "extraction",
  batchId: "batch-1",
  progress: 100,
  fileUrl: null,
  category: "invoice",
} satisfies Omit<
  ExtractionArchiveRow,
  "id" | "extractionId" | "fileId" | "companyId"
>;

describe("planArchiveDeletion", () => {
  it("groups file and entity deletions by company", () => {
    const rows: ArchiveRow[] = [
      extractionRow("company-1", "file-1", "extraction-1"),
      extractionRow("company-2", "file-2", "extraction-2"),
      entityRow("company-1", "fields"),
    ];

    const plan = planArchiveDeletion(rows);

    expect(plan?.fileDeletes).toHaveLength(2);
    expect(
      plan?.fileDeletes.find((item) => item.companyId === "company-1"),
    ).toMatchObject({
      fileIds: ["file-1"],
      extractionIds: ["extraction-1"],
      cascade: { fields: true },
    });
    expect(
      plan?.fileDeletes.find((item) => item.companyId === "company-2"),
    ).toMatchObject({
      fileIds: ["file-2"],
      extractionIds: ["extraction-2"],
      cascade: {},
    });
  });

  it("lets company deletion supersede other selected rows for the same company", () => {
    const rows: ArchiveRow[] = [
      entityRow("company-1", "company"),
      entityRow("company-1", "fields"),
      entityRow("company-1", "products"),
      extractionRow("company-1", "file-1", "extraction-1"),
      entityRow("company-2", "fields"),
    ];

    const plan = planArchiveDeletion(rows);

    expect(plan?.companyDelete?.companyIds).toEqual(["company-1"]);
    expect(plan?.fileDeletes).toHaveLength(1);
    expect(plan?.fileDeletes[0]).toMatchObject({
      companyId: "company-2",
      cascade: { fields: true },
    });
  });

  it("maps Magazzino to productsAll", () => {
    const plan = planArchiveDeletion([entityRow("company-1", "products")]);

    expect(plan?.fileDeletes[0].cascade).toEqual({ productsAll: true });
    expect(plan?.description).toBe(
      "Sei sicuro di voler eliminare tutto il magazzino selezionato?",
    );
  });
});

function entityRow(
  companyId: string,
  entityType: EntityArchiveRow["entityType"],
): EntityArchiveRow {
  return {
    ...baseEntity,
    id: `${entityType}-${companyId}`,
    titolo: entityType,
    companyId,
    entityType,
  };
}

function extractionRow(
  companyId: string,
  fileId: string,
  extractionId: string,
): ExtractionArchiveRow {
  return {
    ...baseExtraction,
    id: `extraction-${extractionId}`,
    companyId,
    fileId,
    extractionId,
  };
}
