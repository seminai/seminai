import type { DeleteFilesBulkBodyCascade } from "@/generated/schemas/deleteFilesBulkBodyCascade";
import type {
  ArchiveRow,
  EntityArchiveRow,
  ExtractionArchiveRow,
} from "@/types/extraction";

export interface ArchiveCompanyDeletePlan {
  readonly companyIds: readonly string[];
}

export interface ArchiveFileDeletePlan {
  readonly companyId: string;
  readonly fileIds: readonly string[];
  readonly extractionIds: readonly string[];
  readonly cascade: DeleteFilesBulkBodyCascade;
}

export interface ArchiveDeletePlan {
  readonly companyDelete: ArchiveCompanyDeletePlan | null;
  readonly fileDeletes: readonly ArchiveFileDeletePlan[];
  readonly description: string;
}

type CascadeKey = keyof DeleteFilesBulkBodyCascade;

const CASCADE_BY_ENTITY: Partial<
  Record<EntityArchiveRow["entityType"], CascadeKey>
> = {
  fields: "fields",
  "production-units": "productionUnits",
  products: "productsAll",
  "field-notes": "fieldNotes",
};

const ENTITY_LABELS: Record<CascadeKey, string> = {
  fields: "campi",
  productionUnits: "unità produttive",
  stocksAll: "magazzino",
  productsAll: "magazzino",
  fieldNotes: "note di campo",
};

interface MutableFilePlan {
  readonly companyId: string;
  readonly fileIds: string[];
  readonly extractionIds: string[];
  readonly cascade: { -readonly [K in CascadeKey]?: boolean };
}

export function planArchiveDeletion(
  rows: readonly ArchiveRow[],
): ArchiveDeletePlan | null {
  const companyIds = collectCompanyDeletionIds(rows);
  const filePlans = new Map<string, MutableFilePlan>();
  let pdfCount = 0;
  for (const row of rows) {
    if (row.kind === "dosage-job") continue;
    if (row.kind === "extraction") {
      if (companyIds.has(row.companyId)) continue;
      addExtraction(filePlans, row);
      pdfCount += 1;
      continue;
    }
    if (companyIds.has(row.companyId)) continue;
    addEntity(filePlans, row);
  }
  const fileDeletes = [...filePlans.values()]
    .filter(hasDeleteContent)
    .map((plan) => ({
      companyId: plan.companyId,
      fileIds: plan.fileIds,
      extractionIds: plan.extractionIds,
      cascade: plan.cascade,
    }));
  if (companyIds.size === 0 && fileDeletes.length === 0) return null;
  return {
    companyDelete: companyIds.size > 0 ? { companyIds: [...companyIds] } : null,
    fileDeletes,
    description: buildDescription(companyIds.size, fileDeletes, pdfCount),
  };
}

function collectCompanyDeletionIds(rows: readonly ArchiveRow[]): Set<string> {
  const companyIds = new Set<string>();
  rows.forEach((row) => {
    if (row.kind === "entity" && row.entityType === "company")
      companyIds.add(row.companyId);
  });
  return companyIds;
}

function addExtraction(
  filePlans: Map<string, MutableFilePlan>,
  row: ExtractionArchiveRow,
): void {
  const plan = getOrCreateFilePlan(filePlans, row.companyId);
  if (row.fileId) plan.fileIds.push(row.fileId);
  if (row.extractionId) plan.extractionIds.push(row.extractionId);
}

function addEntity(
  filePlans: Map<string, MutableFilePlan>,
  row: EntityArchiveRow,
): void {
  if (row.entityType === "company" || row.entityType === "jobs") return;
  const cascadeKey = CASCADE_BY_ENTITY[row.entityType];
  if (!cascadeKey) return;
  const plan = getOrCreateFilePlan(filePlans, row.companyId);
  plan.cascade[cascadeKey] = true;
}

function getOrCreateFilePlan(
  filePlans: Map<string, MutableFilePlan>,
  companyId: string,
): MutableFilePlan {
  const existing = filePlans.get(companyId);
  if (existing) return existing;
  const created: MutableFilePlan = {
    companyId,
    fileIds: [],
    extractionIds: [],
    cascade: {},
  };
  filePlans.set(companyId, created);
  return created;
}

function hasDeleteContent(plan: MutableFilePlan): boolean {
  return (
    plan.fileIds.length > 0 ||
    plan.extractionIds.length > 0 ||
    Object.values(plan.cascade).some(Boolean)
  );
}

function buildDescription(
  companyCount: number,
  fileDeletes: readonly ArchiveFileDeletePlan[],
  pdfCount: number,
): string {
  const cascadeLabels = new Set<CascadeKey>();
  fileDeletes.forEach((plan) => {
    (Object.keys(plan.cascade) as CascadeKey[]).forEach((key) => {
      if (plan.cascade[key]) cascadeLabels.add(key);
    });
  });
  if (companyCount > 0 && cascadeLabels.size === 0 && pdfCount === 0) {
    return companyCount === 1
      ? "Sei sicuro di voler eliminare tutta l'azienda selezionata?"
      : "Sei sicuro di voler eliminare tutte le aziende selezionate?";
  }
  if (companyCount === 0 && cascadeLabels.size === 1 && pdfCount === 0) {
    return singleCascadeDescription([...cascadeLabels][0]);
  }
  const parts: string[] = [];
  if (companyCount > 0) parts.push(companyCount === 1 ? "azienda" : "aziende");
  cascadeLabels.forEach((key) => parts.push(ENTITY_LABELS[key]));
  if (pdfCount > 0)
    parts.push(pdfCount === 1 ? "file selezionato" : "file selezionati");
  return `Sei sicuro di voler eliminare ${parts.join(", ")}? L'operazione è irreversibile.`;
}

function singleCascadeDescription(key: CascadeKey): string {
  if (key === "fields")
    return "Sei sicuro di voler eliminare tutti i campi selezionati?";
  if (key === "productionUnits") {
    return "Sei sicuro di voler eliminare tutte le unità produttive selezionate?";
  }
  if (key === "productsAll" || key === "stocksAll") {
    return "Sei sicuro di voler eliminare tutto il magazzino selezionato?";
  }
  return "Sei sicuro di voler eliminare tutte le note di campo selezionate?";
}
