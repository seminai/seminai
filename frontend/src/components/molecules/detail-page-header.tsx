import { Breadcrumb } from '@/components/atoms/breadcrumb';
import type { BreadcrumbItem } from '@/components/atoms/breadcrumb';
import { Button } from '@/components/ui/button';
import { useSidebar } from '@/hooks/use-sidebar';
import { ArrowUpCircle, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

interface DetailPageHeaderProps {
  readonly breadcrumbItems: readonly BreadcrumbItem[];
  readonly onRefresh?: () => void;
}

export function DetailPageHeader({ breadcrumbItems, onRefresh }: DetailPageHeaderProps) {
  const { isOpen, toggle } = useSidebar();

  return (
    <header className="flex items-center justify-between border-b px-6 py-3">
      <Breadcrumb items={breadcrumbItems} />

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={onRefresh}>
          <ArrowUpCircle className="mr-1.5 h-4 w-4" />
          Aggiorna
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggle}
          title={isOpen ? 'Comprimi sidebar' : 'Espandi sidebar'}
        >
          {isOpen ? (
            <PanelLeftClose className="h-4 w-4" />
          ) : (
            <PanelLeftOpen className="h-4 w-4" />
          )}
        </Button>
      </div>
    </header>
  );
}
