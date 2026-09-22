export interface ManualComplianceInput {
  readonly companyId: string;
  readonly productName: string;
  readonly activeIngredient: string;
  readonly dose: number;
  readonly doseUnit: string;
  readonly applicationDate: Date;
  readonly cropName: string;
  readonly maxApplications?: number;
}

export const readManualComplianceInput = (
  body: Record<string, unknown>,
): ManualComplianceInput | null => {
  const companyId = readString(body.companyId);
  const productName = readString(body.productName);
  const activeIngredient = readString(body.activeIngredient);
  const doseUnit = readString(body.doseUnit);
  const cropName = readString(body.cropName);
  const dose = readNumber(body.dose);
  const applicationDate = readDate(body.applicationDate ?? body.dateOfOpeation);
  if (!companyId || !productName || !activeIngredient || !doseUnit || !cropName) return null;
  if (dose === null || !applicationDate) return null;
  return {
    companyId,
    productName,
    activeIngredient,
    doseUnit,
    cropName,
    dose,
    applicationDate,
    maxApplications: readNumber(body.maxApplications) ?? undefined,
  };
};

const readString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

const readNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const readDate = (value: unknown): Date | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
