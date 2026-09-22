# Creazione Interventi Asincrona - Integrazione Frontend — Part 2

[Back to the guide index](../PRODUCT_JOB_CREATION_ASYNC_API.md)

## Esempio completo React

```typescript
import { useState, useCallback } from 'react';

type JobState = 'idle' | 'submitting' | 'polling' | 'completed' | 'error';

interface UseCreateJobsResult {
  state: JobState;
  progress: number;
  result: any | null;
  error: string | null;
  submit: (items: any[]) => Promise<void>;
}

export function useCreateJobs(): UseCreateJobsResult {
  const [state, setState] = useState<JobState>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async (items: any[]) => {
    setState('submitting');
    setProgress(0);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/jobs/create-product-and-job', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(items),
      });

      const body = await response.json();

      // Path sincrono
      if (response.status === 201) {
        setResult(body.data);
        setProgress(100);
        setState('completed');
        return;
      }

      // Path asincrono
      if (response.status === 202) {
        const { taskId } = body.data;
        setState('polling');

        // Polling loop
        while (true) {
          await new Promise((r) => setTimeout(r, 2000));

          const statusRes = await fetch(`/jobs/create-product-and-job/status/${taskId}`, {
            headers: { Authorization: `Bearer ${getToken()}` },
          });
          const { data } = await statusRes.json();

          setProgress(data.progress || 0);

          if (data.state === 'completed') {
            setResult(data.result);
            setProgress(100);
            setState('completed');
            return;
          }

          if (data.state === 'failed') {
            throw new Error(data.failedReason || 'Creazione fallita');
          }

          if (data.stopPolling) {
            throw new Error(data.message || 'Job non trovato');
          }
        }
      }

      throw new Error(`Unexpected status: ${response.status}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState('error');
    }
  }, []);

  return { state, progress, result, error, submit };
}
```

### Uso nel componente

```tsx
function CreateJobsPage() {
  const { state, progress, result, error, submit } = useCreateJobs();

  return (
    <div>
      <button
        onClick={() => submit(items)}
        disabled={state === 'submitting' || state === 'polling'}
      >
        Crea Interventi
      </button>

      {state === 'polling' && (
        <div>
          <p>Elaborazione in corso...</p>
          <progress value={progress} max={100} />
          <span>{progress}%</span>
        </div>
      )}

      {state === 'completed' && result && (
        <div>
          <p>Creati {result.jobs.length} interventi</p>
          {result.warnings?.length > 0 && (
            <ul>
              {result.warnings.map((w, i) => (
                <li key={i}>
                  {w.productName}: {w.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {state === 'error' && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  );
}
```
