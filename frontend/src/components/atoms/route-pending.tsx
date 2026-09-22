import { SpinningLogo } from '@/components/atoms/spinning-logo';

export function RoutePending() {
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <SpinningLogo size={48} />
    </div>
  );
}
