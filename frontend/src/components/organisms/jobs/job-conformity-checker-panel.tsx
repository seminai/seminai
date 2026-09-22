import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  getJobVerificationState,
  postJobVerificationApprove,
  postJobVerificationMessage,
  postJobVerificationReject,
  streamJobVerificationAgent,
} from '@/lib/job-verification-agent';
import { sanitizeUserFacingText } from '@/lib/safe-display';
import type { JobOperationRow, VerificationLiveStep, VerificationSnapshot } from './types';
import { appendLiveStep, buildLiveStep, pickEventStep } from './job-conformity-live-steps';

interface ChatMessage {
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string;
}

export interface JobConformityCheckerPanelRef {
  handleVerify: () => Promise<void>;
}

interface JobConformityCheckerPanelProps {
  readonly jobId: string | null;
  readonly selectedJobs: readonly JobOperationRow[];
  readonly onVerificationStateChange: (snapshot: VerificationSnapshot) => void;
  readonly onConformityConfirmSuccess: () => Promise<void> | void;
}

function nowIso(): string {
  return new Date().toISOString();
}

export const JobConformityCheckerPanel = forwardRef<
  JobConformityCheckerPanelRef,
  JobConformityCheckerPanelProps
>(function JobConformityCheckerPanel(
  { jobId, selectedJobs, onVerificationStateChange, onConformityConfirmSuccess },
  ref,
) {
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [threadId, setThreadId] = useState<string>('');
  const [pendingApproval, setPendingApproval] = useState(false);
  const liveStepsRef = useRef<readonly VerificationLiveStep[]>([]);
  const isDisabled = !jobId || selectedJobs.length === 0;

  const jobsPayload = useMemo(
    () => selectedJobs.map((job) => job.raw),
    [selectedJobs],
  );

  function updateSnapshot(
    status: VerificationSnapshot['status'],
    message: string,
    id: string,
    steps: readonly VerificationLiveStep[],
  ) {
    onVerificationStateChange({
      status,
      message,
      threadId: id,
      updatedAtIso: nowIso(),
      liveSteps: steps,
    });
  }

  async function sendStreamMessage(message: string): Promise<void> {
    if (isDisabled || !jobId) return;
    const currentThreadId = threadId || `job-verification-${jobId}-${Date.now()}`;
    setThreadId(currentThreadId);
    setIsLoading(true);
    setPendingApproval(false);
    liveStepsRef.current = [];
    setMessages((prev) => [...prev, { role: 'user', content: message }]);
    updateSnapshot('streaming', 'Verifica conformità in corso...', currentThreadId, []);
    let streamedAssistantText = '';
    let requiresApproval = false;
    try {
      const pushStep = (
        step: VerificationLiveStep,
        status: VerificationSnapshot['status'] = 'streaming',
      ) => {
        const next = appendLiveStep(liveStepsRef.current, step);
        liveStepsRef.current = next;
        updateSnapshot(status, step.text, currentThreadId, next);
      };
      await streamJobVerificationAgent(
        { threadId: currentThreadId, jobs: jobsPayload, message },
        (event) => {
          const liveStep = pickEventStep(event);
          if (liveStep) pushStep(liveStep);
          if (event.type === 'token' && typeof event.content === 'string') {
            streamedAssistantText += event.content;
          }
          if (event.type === 'requires_approval' || event.type === 'requires_modification_approval') {
            setPendingApproval(true);
            requiresApproval = true;
            pushStep(buildLiveStep('system', "L'agente richiede approvazione."), 'requires_approval');
          }
          if (event.type === 'complete') {
            const response = event.response as Record<string, unknown> | undefined;
            const finalText =
              typeof response?.message === 'string' && response.message.length > 0
                ? response.message
                : streamedAssistantText || 'Verifica completata.';
            const safeFinalText = sanitizeUserFacingText(finalText);
            setMessages((prev) => [...prev, { role: 'assistant', content: safeFinalText }]);
            updateSnapshot('completed', safeFinalText, currentThreadId, liveStepsRef.current);
          }
          if (event.type === 'error') {
            const errorMessage =
              typeof event.error === 'string' ? event.error : 'Errore durante la verifica conformità.';
            const safeErrorMessage = sanitizeUserFacingText(errorMessage);
            setMessages((prev) => [...prev, { role: 'system', content: safeErrorMessage }]);
            pushStep(buildLiveStep('system', safeErrorMessage), 'error');
          }
        },
      );
      if (!streamedAssistantText && !requiresApproval) {
        const fallback = await postJobVerificationMessage({
          threadId: currentThreadId,
          jobs: jobsPayload,
          message,
        });
        const fallbackText =
          ((fallback.data as Record<string, unknown>)?.data as Record<string, unknown> | undefined)
            ?.message ?? 'Messaggio inviato.';
        const renderedMessage = sanitizeUserFacingText(String(fallbackText));
        setMessages((prev) => [...prev, { role: 'assistant', content: renderedMessage }]);
        updateSnapshot('completed', renderedMessage, currentThreadId, liveStepsRef.current);
      }
    } catch (error) {
      const messageText = sanitizeUserFacingText(
        error instanceof Error ? error.message : 'Errore durante il flusso conformità.',
      );
      setMessages((prev) => [...prev, { role: 'system', content: messageText }]);
      const next = appendLiveStep(liveStepsRef.current, buildLiveStep('system', messageText));
      liveStepsRef.current = next;
      updateSnapshot('error', messageText, currentThreadId, next);
    } finally {
      setIsLoading(false);
      setInputMessage('');
    }
  }

  async function handleApprove(): Promise<void> {
    if (!threadId) return;
    setIsLoading(true);
    try {
      const response = await postJobVerificationApprove({ threadId });
      const responseData = response.data as Record<string, unknown>;
      const payload = responseData.data as Record<string, unknown> | undefined;
      const text = sanitizeUserFacingText(payload?.message ? String(payload.message) : 'Approvazione inviata.');
      setMessages((prev) => [...prev, { role: 'assistant', content: text }]);
      setPendingApproval(false);
      const next = appendLiveStep(liveStepsRef.current, buildLiveStep('system', text));
      liveStepsRef.current = next;
      updateSnapshot('completed', text, threadId, next);
      await onConformityConfirmSuccess();
    } finally {
      setIsLoading(false);
    }
  }

  async function handleReject(): Promise<void> {
    if (!threadId) return;
    setIsLoading(true);
    try {
      const response = await postJobVerificationReject({
        threadId,
        reason: 'Rifiutato manualmente dall’utente.',
      });
      const responseData = response.data as Record<string, unknown>;
      const payload = responseData.data as Record<string, unknown> | undefined;
      const text = sanitizeUserFacingText(payload?.message ? String(payload.message) : 'Richiesta rifiutata.');
      setMessages((prev) => [...prev, { role: 'system', content: text }]);
      setPendingApproval(false);
      const next = appendLiveStep(liveStepsRef.current, buildLiveStep('system', text));
      liveStepsRef.current = next;
      updateSnapshot('error', text, threadId, next);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRefreshState(): Promise<void> {
    if (!threadId) return;
    const state = await getJobVerificationState(threadId);
    const stateData = state.data as Record<string, unknown>;
    const payload = stateData.data as Record<string, unknown> | undefined;
    const text = payload?.status ? `Stato: ${String(payload.status)}` : 'Stato aggiornato.';
    setMessages((prev) => [...prev, { role: 'system', content: text }]);
  }

  useImperativeHandle(ref, () => ({
    handleVerify: async () => {
      await sendStreamMessage('Esegui una verifica conformità automatica per le operazioni selezionate.');
    },
  }));

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <h3 className="text-sm font-semibold">Chat verifica conformità</h3>
      {isDisabled ? (
        <p className="text-sm text-muted-foreground">
          Seleziona un gruppo job e almeno un&apos;operazione per avviare la conformità.
        </p>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto rounded-md border p-3">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun messaggio.</p>
        ) : (
          <div className="space-y-2">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className="text-sm">
                <span className="font-medium capitalize">{message.role}: </span>
                <span>{message.content}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <Textarea
        value={inputMessage}
        onChange={(event) => setInputMessage(event.target.value)}
        placeholder="Scrivi un messaggio per l'agente..."
        rows={3}
        disabled={isLoading || isDisabled}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => sendStreamMessage(inputMessage || 'Verifica conformità delle operazioni selezionate.')}
          disabled={isLoading || isDisabled}
        >
          Invia
        </Button>
        <Button size="sm" variant="outline" onClick={handleRefreshState} disabled={isLoading || !threadId}>
          Aggiorna stato
        </Button>
        {pendingApproval ? (
          <>
            <Button size="sm" variant="default" onClick={handleApprove} disabled={isLoading}>
              Approva
            </Button>
            <Button size="sm" variant="destructive" onClick={handleReject} disabled={isLoading}>
              Rifiuta
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
});
