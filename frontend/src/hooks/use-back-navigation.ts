import { useCanGoBack, useNavigate, useRouter } from '@tanstack/react-router';
import type { NavigateOptions } from '@tanstack/react-router';

/** Browser-history back when possible, otherwise navigate to the logical parent. */
export function useBackNavigation(fallback: NavigateOptions): () => void {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const navigate = useNavigate();

  return () => {
    if (canGoBack) {
      router.history.back();
    } else {
      void navigate(fallback);
    }
  };
}
