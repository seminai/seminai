import { ArrowLeft } from 'lucide-react';
import type { NavigateOptions } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { useBackNavigation } from '@/hooks/use-back-navigation';

interface BackButtonProps {
  readonly fallback: NavigateOptions;
  readonly label?: string;
  readonly className?: string;
  /** When set, replaces the history-back behavior (e.g. internal wizard steps). */
  readonly onPress?: () => void;
}

/** Standard back affordance: ghost button with arrow, top-left of the page. */
export function BackButton({ fallback, label = 'Indietro', className, onPress }: BackButtonProps) {
  const goBack = useBackNavigation(fallback);

  return (
    <Button variant="ghost" size="sm" className={className} onClick={onPress ?? goBack}>
      <ArrowLeft className="mr-1.5 h-4 w-4" />
      {label}
    </Button>
  );
}
