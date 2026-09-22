import { createRouter, RouterProvider } from '@tanstack/react-router';
import { Toaster } from 'sonner';
import { QueryProvider, queryClient } from '@/providers/QueryProvider';
import { capturePageview } from '@/lib/analytics';
import { CookieConsentBanner } from '@/components/organisms/cookie-consent-banner';
import { routeTree } from './routeTree.gen';

export const router = createRouter({
  routeTree,
  context: { queryClient },
});

// Fire a manual PostHog $pageview after each settled navigation (SPA).
// The router is a module singleton, so this subscribes exactly once.
router.subscribe('onResolved', ({ toLocation }) => {
  capturePageview(toLocation.pathname);
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export default function App() {
  return (
    <QueryProvider>
      <RouterProvider router={router} context={{ queryClient }} />
      <Toaster richColors position="top-right" />
      <CookieConsentBanner />
    </QueryProvider>
  );
}
