import { Check, Loader2, Sparkles, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { ConformityProposal } from '@/types/conformity-checker';

interface JobConformityProposalsListProps {
  readonly proposals: readonly ConformityProposal[];
  readonly applyingJobId: string | null;
  readonly onApprove: (jobId: string) => Promise<void> | void;
  readonly onReject: (jobId: string) => void;
}

function formatQuantity(value: number, unit: string): string {
  const formatted = Number.isInteger(value) ? value.toString() : value.toFixed(2);
  return `${formatted} ${unit}`.trim();
}

function describeChange(proposal: ConformityProposal): string {
  if (proposal.shouldExclude) return 'ESCLUSO';
  const before = formatQuantity(
    proposal.originalValues.quantity,
    proposal.originalValues.unitOfMeasureQuantity,
  );
  const after = formatQuantity(
    proposal.proposedValues.quantity,
    proposal.proposedValues.unitOfMeasureQuantity,
  );
  if (before === after) return `${before} (nessuna modifica dose)`;
  return `${before} → ${after}`;
}

export function JobConformityProposalsList({
  proposals,
  applyingJobId,
  onApprove,
  onReject,
}: JobConformityProposalsListProps) {
  if (proposals.length === 0) return null;
  return (
    <Card size="sm">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Sparkles className="size-4 text-primary" aria-hidden />
          Proposte AI ({proposals.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 p-2">
        {proposals.map((proposal) => (
          <ProposalRow
            key={proposal.jobId}
            proposal={proposal}
            isApplying={applyingJobId === proposal.jobId}
            isAnyApplying={applyingJobId !== null}
            onApprove={() => onApprove(proposal.jobId)}
            onReject={() => onReject(proposal.jobId)}
          />
        ))}
      </CardContent>
    </Card>
  );
}

interface ProposalRowProps {
  readonly proposal: ConformityProposal;
  readonly isApplying: boolean;
  readonly isAnyApplying: boolean;
  readonly onApprove: () => Promise<void> | void;
  readonly onReject: () => void;
}

function ProposalRow({
  proposal,
  isApplying,
  isAnyApplying,
  onApprove,
  onReject,
}: ProposalRowProps) {
  const violationsCount = proposal.violations.length;
  const change = describeChange(proposal);
  const isExcluded = proposal.shouldExclude;
  return (
    <div
      className={cn(
        'flex flex-wrap items-start gap-2 rounded-md border bg-muted/20 p-2',
        isExcluded ? 'border-destructive/30' : 'border-border',
      )}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium leading-snug wrap-break-word">
          {proposal.productName || proposal.jobId}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge
            variant={isExcluded ? 'destructive' : 'secondary'}
            className="text-[10px]"
          >
            {change}
          </Badge>
          {violationsCount > 0 ? (
            <Badge variant="outline" className="text-[10px]">
              {violationsCount} {violationsCount === 1 ? 'violazione' : 'violazioni'}
            </Badge>
          ) : null}
        </div>
        {isExcluded && proposal.exclusionReason ? (
          <p className="text-xs text-muted-foreground leading-snug wrap-break-word">
            {proposal.exclusionReason}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          size="icon-sm"
          variant="default"
          aria-label="Approva proposta"
          title="Approva proposta"
          onClick={() => void onApprove()}
          disabled={isAnyApplying}
        >
          {isApplying ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          aria-label="Rifiuta proposta"
          title="Rifiuta proposta"
          onClick={onReject}
          disabled={isAnyApplying}
        >
          <X className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
