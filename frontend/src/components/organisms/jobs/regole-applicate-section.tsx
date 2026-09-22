import { ScrollText, AlertTriangle, BookOpen, Sliders } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { JobDetailToggleSection } from './job-detail-toggle-section';
import type {
  AppliedRulePayload,
  AppliedRuleCitation,
  AppliedRuleAdjustment,
  RuleViolationDetail,
  RuleViolationSeverity,
} from '@/types/applied-rules';

interface Props {
  readonly appliedRules: ReadonlyArray<AppliedRulePayload>;
}

export function RegoleApplicateSection({ appliedRules }: Props) {
  if (appliedRules.length === 0) return null;
  const hasViolations = appliedRules.some((r) => r.violations.length > 0);
  return (
    <JobDetailToggleSection
      title="Regole applicate"
      icon={ScrollText}
      tone={hasViolations ? 'amber' : 'default'}
      defaultOpen={hasViolations}
    >
      <div className="space-y-4 pt-2">
        {appliedRules.map((rule) => (
          <RuleCard key={rule.ruleId} rule={rule} />
        ))}
      </div>
    </JobDetailToggleSection>
  );
}

function RuleCard({ rule }: { readonly rule: AppliedRulePayload }) {
  return (
    <div className="rounded-lg border bg-card p-3 space-y-3">
      <RuleHeader rule={rule} />
      {rule.violations.length > 0 ? <ViolationsBlock violations={rule.violations} /> : null}
      {rule.citations.length > 0 ? <CitationsBlock citations={rule.citations} /> : null}
      {rule.adjustments.length > 0 ? <AdjustmentsBlock adjustments={rule.adjustments} /> : null}
    </div>
  );
}

function RuleHeader({ rule }: { readonly rule: AppliedRulePayload }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-medium text-sm wrap-break-word">{rule.ruleName}</span>
      <Badge variant="outline" className="text-xs">{rule.category}</Badge>
      <Badge variant="outline" className="text-xs">
        {rule.source === 'company' ? 'Azienda' : 'Workspace'}
      </Badge>
      <Badge
        variant={rule.isCompliant ? 'secondary' : 'destructive'}
        className="text-xs"
      >
        {rule.isCompliant ? 'Conforme' : 'Non conforme'}
      </Badge>
    </div>
  );
}

function ViolationsBlock({
  violations,
}: {
  readonly violations: ReadonlyArray<RuleViolationDetail>;
}) {
  return (
    <div className="space-y-2">
      <SectionLabel icon={AlertTriangle} text="Violazioni" />
      <ul className="space-y-1.5">
        {violations.map((v, i) => (
          <li key={`${v.ruleId}-${v.violationType}-${i}`} className="text-sm space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={severityVariant(v.severity)} className="text-[10px]">
                {v.severity}
              </Badge>
              <span className="text-xs text-muted-foreground">{v.violationType}</span>
            </div>
            <p className="leading-snug wrap-break-word">{v.description}</p>
            {v.suggestedAction ? (
              <p className="text-xs text-muted-foreground wrap-break-word">
                Azione suggerita: {v.suggestedAction}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CitationsBlock({
  citations,
}: {
  readonly citations: ReadonlyArray<AppliedRuleCitation>;
}) {
  return (
    <div className="space-y-2">
      <SectionLabel icon={BookOpen} text="Citazioni dal PDF" />
      <ul className="space-y-1.5">
        {citations.map((c) => (
          <li key={c.chunkIndex} className="text-sm rounded-md bg-muted/50 px-2.5 py-2 space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {typeof c.page === 'number' ? <span>Pagina {c.page}</span> : null}
              <span>Score {c.score.toFixed(2)}</span>
              <span>Chunk #{c.chunkIndex}</span>
            </div>
            <p className="leading-snug wrap-break-word">{c.snippet}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AdjustmentsBlock({
  adjustments,
}: {
  readonly adjustments: ReadonlyArray<AppliedRuleAdjustment>;
}) {
  return (
    <div className="space-y-2">
      <SectionLabel icon={Sliders} text="Adeguamenti automatici" />
      <ul className="space-y-1.5">
        {adjustments.map((a, i) => (
          <li key={`${a.productName}-${i}`} className="text-sm space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{a.productName}</span>
              <span className="text-xs text-muted-foreground">{a.activeIngredient}</span>
              <Badge variant="outline" className="text-[10px]">
                {a.treatmentsKept} mantenuti / {a.treatmentsRemoved} rimossi
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground leading-snug wrap-break-word">
              {a.motivazione}
            </p>
            {a.notaPerAgronomo ? (
              <p className="text-xs italic text-muted-foreground wrap-break-word">
                {a.notaPerAgronomo}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SectionLabel({
  icon: Icon,
  text,
}: {
  readonly icon: typeof AlertTriangle;
  readonly text: string;
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <Icon className="size-3.5" aria-hidden />
      {text}
    </div>
  );
}

function severityVariant(severity: RuleViolationSeverity): 'destructive' | 'secondary' | 'outline' {
  if (severity === 'CRITICAL') return 'destructive';
  if (severity === 'WARNING') return 'secondary';
  return 'outline';
}
