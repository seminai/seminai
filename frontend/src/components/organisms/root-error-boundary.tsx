import { useTranslation } from 'react-i18next';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { attemptChunkReload, isChunkLoadError } from '@/lib/chunk-reload';

export function RootErrorBoundary({ error, reset }: ErrorComponentProps) {
  const { t } = useTranslation();

  if (isChunkLoadError(error) && attemptChunkReload()) {
    return null;
  }

  const message = error instanceof Error ? error.message : t('errors.root.unexpected');

  function handleReload() {
    reset();
    window.location.reload();
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background p-6">
      <div className="flex max-w-md flex-col items-start gap-4 rounded-xl border bg-card p-6 shadow-sm">
        <h1 className="text-lg font-semibold">{t('errors.root.title')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('errors.root.description')}
        </p>
        <pre className="max-h-40 w-full overflow-auto rounded-md bg-muted p-3 text-xs text-muted-foreground">
          {message}
        </pre>
        <Button onClick={handleReload}>{t('errors.root.reload')}</Button>
      </div>
    </div>
  );
}
