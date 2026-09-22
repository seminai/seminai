import { Field, ProductionUnit } from '@prisma/client';
import { normalizeAreaHa } from './area-normalization';

export const normalizedUnits = (input: {
  unitOfProduction: Partial<ProductionUnit & Partial<Field> & { disciplinari: string[] }>[];
}): Partial<ProductionUnit & Partial<Field> & { disciplinari: string[] }>[] =>
  Array.isArray(input.unitOfProduction)
    ? input.unitOfProduction.map((u) => {
        // Accept multiple possible incoming field names and normalize them.
        const id: string = String(
          (u as { id?: string; idApp?: string }).id ?? (u as { idApp?: string }).idApp ?? '',
        ).trim();
        const cropNameRaw =
          (u as { cropName?: string }).cropName ??
          (u as { coltura?: string }).coltura ??
          (u as { name?: string }).name ??
          '';
        const varietyRaw =
          (u as { variety?: string }).variety ??
          (u as { varieta?: string }).varieta ??
          (u as { regione?: string }).regione ??
          '';
        // area/ superficie
        const areaCandidates: Array<unknown> = [
          (u as { areaHa?: number }).areaHa,
          (u as { superficie?: string | number }).superficie,
          (u as { sauHa?: number }).sauHa,
          (u as { gisHa?: number }).gisHa,
        ];
        let areaHa: number | undefined;
        for (const c of areaCandidates) {
          const parsed = normalizeAreaHa(c);
          if (typeof parsed === 'number' && Number.isFinite(parsed)) {
            areaHa = parsed;
            break;
          }
        }
        const cropName = String(cropNameRaw).trim();
        const variety = String(varietyRaw).trim();
        const name = String((u as { name?: string }).name ?? '').trim();
        const regione = String((u as { regione?: string }).regione ?? '').trim();
        const fallbackCrop = cropName || name || 'unknown-crop';
        const fallbackVariety = variety || regione || 'unknown-variety';
        return {
          ...u,
          ...(id ? { id } : {}),
          cropName: fallbackCrop,
          variety: fallbackVariety,
          ...(typeof areaHa === 'number' ? { areaHa } : {}),
        } as Partial<ProductionUnit & Partial<Field> & { disciplinari: string[] }>;
      })
    : [];
