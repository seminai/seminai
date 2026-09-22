export interface CultivarEntry {
  readonly id: string;
  readonly name: string;
  readonly harvestLabel?: string;
  readonly offsetDays?: number;
}

export interface CropCultivarGroup {
  readonly varieties: readonly CultivarEntry[];
}

export type CultivarsByCropIndex = Readonly<Record<string, CropCultivarGroup>>;

const ITALIAN_MONTHS: Readonly<Record<string, number>> = {
  gen: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  mag: 5,
  giu: 6,
  lug: 7,
  ago: 8,
  set: 9,
  ott: 10,
  nov: 11,
  dic: 12,
};

function normalizeKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseHarvestLabel(label: string, referenceYear: number): Date | null {
  const match = /^(\d{1,2})-([a-z]{3})$/i.exec(label.trim());
  if (!match) return null;
  const day = Number.parseInt(match[1], 10);
  const month = ITALIAN_MONTHS[match[2].toLowerCase()];
  if (!month || !Number.isFinite(day)) return null;
  return new Date(referenceYear, month - 1, day);
}

export class CultivarCatalog {
  private readonly index: CultivarsByCropIndex;

  constructor(index: CultivarsByCropIndex) {
    this.index = index;
  }

  getCultivarsForCrop(cropCode: string): readonly CultivarEntry[] {
    return this.index[cropCode]?.varieties ?? [];
  }

  findCultivar(cropCode: string, varietyName: string): CultivarEntry | undefined {
    const key = normalizeKey(varietyName);
    return this.getCultivarsForCrop(cropCode).find(
      (entry) => normalizeKey(entry.name) === key,
    );
  }

  getRecommendedHarvestDate(params: {
    readonly cropCode: string;
    readonly variety: string;
    readonly periodStart: string;
  }): string | null {
    const cultivar = this.findCultivar(params.cropCode, params.variety);
    if (!cultivar?.harvestLabel) return null;

    const start = new Date(params.periodStart);
    if (Number.isNaN(start.getTime())) return null;

    let harvest = parseHarvestLabel(cultivar.harvestLabel, start.getFullYear());
    if (!harvest) return null;

    if (cultivar.offsetDays) {
      harvest = new Date(harvest);
      harvest.setDate(harvest.getDate() + cultivar.offsetDays);
    }

    if (harvest < start) {
      const nextYear = parseHarvestLabel(cultivar.harvestLabel, start.getFullYear() + 1);
      if (nextYear) {
        harvest = nextYear;
        if (cultivar.offsetDays) {
          harvest.setDate(harvest.getDate() + cultivar.offsetDays);
        }
      }
    }

    return toIsoDate(harvest);
  }
}
