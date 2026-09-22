import type { CropCatalogEntry } from '@/hooks/use-crop-catalog';

function parseDayMonth(value: string, year: number): Date {
  const [day, month] = value.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function adjustAfter(reference: Date, candidate: Date): Date {
  if (candidate >= reference) return candidate;
  return new Date(candidate.getFullYear() + 1, candidate.getMonth(), candidate.getDate());
}

export interface SuggestedCropDates {
  readonly sowingDate: string;
  readonly floweringDate: string;
  readonly harvestingDate: string;
}

export function suggestCropDates(
  crop: CropCatalogEntry,
  periodStart: string,
): SuggestedCropDates | null {
  const start = periodStart ? new Date(periodStart) : new Date();
  if (Number.isNaN(start.getTime())) return null;
  const year = start.getFullYear();
  const sowingRaw = crop.sowingPeriod?.minDate;
  const floweringRaw = crop.floweringPeriod?.minDate;
  const harvestRaw = crop.harvestPeriod?.minDate;
  if (!sowingRaw || !floweringRaw || !harvestRaw) return null;

  let sowing = parseDayMonth(sowingRaw, year);
  if (sowing < start) {
    sowing = new Date(sowing.getFullYear() + 1, sowing.getMonth(), sowing.getDate());
  }
  const flowering = adjustAfter(sowing, parseDayMonth(floweringRaw, sowing.getFullYear()));
  const harvesting = adjustAfter(flowering, parseDayMonth(harvestRaw, flowering.getFullYear()));

  return {
    sowingDate: toIsoDate(sowing),
    floweringDate: toIsoDate(flowering),
    harvestingDate: toIsoDate(harvesting),
  };
}
