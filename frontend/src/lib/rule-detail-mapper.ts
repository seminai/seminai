import type { RuleCategory, RuleStatus } from "@/types/workspace";

export interface RawRuleDetail {
  readonly name: string;
  readonly description: string | null;
  readonly category: RuleCategory;
  readonly status: RuleStatus;
  readonly content: unknown;
  readonly region: string | null;
  readonly pdfFileUrl: string | null;
  readonly pdfFileName: string | null;
  readonly isVectorized: boolean;
  readonly vectorizedAt: string | null;
  readonly vectorizationError: string | null;
  readonly isPublic: boolean;
}

export function mapRawRuleDetail(raw: Record<string, unknown>): RawRuleDetail {
  return {
    name: String(raw.name ?? ""),
    description: raw.description ? String(raw.description) : null,
    category: (raw.category as RuleCategory) ?? "STANDARD",
    status: (raw.status as RuleStatus) ?? "DRAFT",
    content: raw.content ?? "",
    region: raw.region ? String(raw.region) : null,
    pdfFileUrl: raw.pdfFileUrl ? String(raw.pdfFileUrl) : null,
    pdfFileName: raw.pdfFileName ? String(raw.pdfFileName) : null,
    isVectorized: raw.isVectorized === true,
    vectorizedAt: raw.vectorizedAt ? String(raw.vectorizedAt) : null,
    vectorizationError: raw.vectorizationError
      ? String(raw.vectorizationError)
      : null,
    isPublic: raw.isPublic === true,
  };
}
