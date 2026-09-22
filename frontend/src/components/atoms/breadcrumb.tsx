import { Link } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';

export interface BreadcrumbItem {
  readonly label: string;
  readonly href?: string;
}

interface BreadcrumbProps {
  readonly items: readonly BreadcrumbItem[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav className="flex items-center gap-1 text-sm">
      {items.map((item, i) => (
        <span key={item.label} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          {item.href ? (
            <Link
              to={item.href}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ) : (
            <span className="font-medium text-foreground">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
