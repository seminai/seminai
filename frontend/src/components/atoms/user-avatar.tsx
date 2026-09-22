import { cn } from '@/lib/utils';

interface UserAvatarProps {
  readonly src?: string | null;
  readonly name?: string;
  readonly size?: 'sm' | 'md' | 'lg';
  readonly className?: string;
}

const sizeClasses = {
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-8 w-8 text-xs',
  lg: 'h-20 w-20 text-xl',
} as const;

function getInitials(name?: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function UserAvatar({ src, name, size = 'md', className }: UserAvatarProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted font-medium text-muted-foreground',
        sizeClasses[size],
        className,
      )}
    >
      {src ? (
        <img src={src} alt={name ?? 'Avatar'} className="h-full w-full object-cover" />
      ) : (
        getInitials(name)
      )}
    </span>
  );
}
