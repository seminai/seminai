import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { sanitizeUserFacingText } from '@/lib/safe-display';
import { useConformityProcess } from '@/hooks/use-conformity-process';
import { JobVerificationStatusBox } from './job-verification-status-box';
import { JobConformityProposalsList } from './job-conformity-proposals-list';
import type { JobOperationRow, VerificationSnapshot } from './types';

interface JobVerificationAgentChatPanelProps {
  readonly jobId: string | null;
  readonly selectedJobs: readonly JobOperationRow[];
  readonly verificationSnapshot: VerificationSnapshot | null;
  readonly onConformityConfirmSuccess?: () => Promise<void> | void;
}

export function JobVerificationAgentChatPanel({
  jobId,
  selectedJobs,
  verificationSnapshot,
  onConformityConfirmSuccess,
}: JobVerificationAgentChatPanelProps) {
  const [notes, setNotes] = useState('');
  const isContextMissing = !jobId || selectedJobs.length === 0;
  const conformityProcess = useConformityProcess({
    jobGroupId: jobId,
    notes,
    onProposalApplied: onConformityConfirmSuccess,
  });
  const errorMessage = conformityProcess.startError
    ? sanitizeUserFacingText(conformityProcess.startError.message)
    : null;

  async function handleAutomaticVerification(): Promise<void> {
    await conformityProcess.start();
  }

  return (
    <section className="flex h-full min-h-0 flex-col rounded-md border bg-card">
      <div className="border-b px-3 py-3">
        <h3 className="text-sm font-semibold">Verifica operazioni</h3>
        <p className="text-xs text-muted-foreground">
          Avvia il controllo sul gruppo {jobId ?? '-'} con {selectedJobs.length} operazioni selezionate.
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-auto px-3 py-3">
        <JobVerificationStatusBox snapshot={verificationSnapshot} title="Stato verifica live" />
        <JobConformityProposalsList
          proposals={conformityProcess.proposals}
          applyingJobId={conformityProcess.applyingJobId}
          onApprove={conformityProcess.approveProposal}
          onReject={conformityProcess.rejectProposal}
        />
        <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
          La verifica automatica usa il job asincrono dedicato e riceve avanzamento e risultato dallo stream realtime.
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="conformity-notes">
            Note opzionali
          </label>
          <Textarea
            id="conformity-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Aggiungi note agronomiche opzionali..."
            rows={4}
            disabled={conformityProcess.isRunning}
          />
        </div>
        {conformityProcess.activeJobId ? (
          <p className="text-xs text-muted-foreground">Job realtime: {conformityProcess.activeJobId}</p>
        ) : null}
        {errorMessage ? <p className="text-xs text-destructive">{errorMessage}</p> : null}
      </div>

      <div className="border-t px-3 py-3">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => void handleAutomaticVerification()}
          disabled={conformityProcess.isRunning || isContextMissing}
        >
          {conformityProcess.isRunning ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          Verifica conformità automatica
        </Button>
      </div>
    </section>
  );
}
