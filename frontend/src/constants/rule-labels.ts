import type { RuleCategory, RuleStatus } from "@/types/workspace";

export const RULE_CATEGORY_LABELS: Record<RuleCategory, string> = {
  DISCIPLINARE: "Disciplinare",
  STANDARD: "Standard",
  BEST_PRACTICE: "Best Practice",
  METHODOLOGY: "Metodologia",
  CUSTOM: "Custom",
} as const;

export const RULE_STATUS_LABELS: Record<RuleStatus, string> = {
  DRAFT: "Bozza",
  ACTIVE: "Attiva",
  ARCHIVED: "Archiviata",
  DEPRECATED: "Deprecata",
} as const;

export const RULE_CATEGORY_OPTIONS: ReadonlyArray<{
  readonly value: RuleCategory;
  readonly label: string;
}> = [
  { value: "DISCIPLINARE", label: "Disciplinare" },
  { value: "STANDARD", label: "Standard" },
  { value: "BEST_PRACTICE", label: "Best Practice" },
  { value: "METHODOLOGY", label: "Metodologia" },
  { value: "CUSTOM", label: "Custom" },
];
