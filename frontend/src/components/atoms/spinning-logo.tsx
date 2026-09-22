import { cn } from '@/lib/utils';

interface SpinningLogoProps {
  readonly size?: number;
  readonly className?: string;
}

export function SpinningLogo({ size = 20, className }: SpinningLogoProps) {
  return (
    <img
      src="/logo.png"
      alt="Loading"
      width={size}
      height={size}
      className={cn('animate-spin', className)}
    />
  );
}
