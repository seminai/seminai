import { createFileRoute } from '@tanstack/react-router';
import { useLayoutEffect } from 'react';

const LANDING_IFRAME_SRC = '/try-seminai/index.html';

function TrySeminaiLandingShell() {
  useLayoutEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevHtmlTouchAction = html.style.touchAction;
    const prevBodyTouchAction = body.style.touchAction;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    html.style.touchAction = 'manipulation';
    body.style.touchAction = 'manipulation';
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      html.style.touchAction = prevHtmlTouchAction;
      body.style.touchAction = prevBodyTouchAction;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex min-h-dvh w-full max-w-full touch-manipulation flex-col overflow-x-hidden overflow-y-hidden overscroll-none bg-[#efe6d2]">
      <iframe
        title="Seminai — Excel fatture fitofarmaci"
        src={LANDING_IFRAME_SRC}
        className="min-h-0 min-w-0 flex-1 border-0 bg-[#efe6d2]"
        loading="eager"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}

export const Route = createFileRoute('/try-seminai')({
  component: TrySeminaiLandingShell,
});
