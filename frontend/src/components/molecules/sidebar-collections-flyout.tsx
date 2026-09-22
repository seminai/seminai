import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Folder, Search } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { SidebarFolderItem } from '@/components/atoms/sidebar-folder-item';
import { useSidebarCompanies } from '@/hooks/use-sidebar-companies';
import { cn } from '@/lib/utils';

interface SidebarCollectionsFlyoutProps {
  readonly activeCompanyId: string | undefined;
}

/**
 * Collapsed-sidebar variant of the collections section: a single folder icon
 * that opens, on hover/click, a lateral flyout with a search input and the full
 * scrollable, filterable folder list.
 */
export function SidebarCollectionsFlyout({ activeCompanyId }: SidebarCollectionsFlyoutProps) {
  const { companies } = useSidebarCompanies();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return companies;
    const term = searchTerm.toLowerCase();
    return companies.filter((c) => c.name.toLowerCase().includes(term));
  }, [companies, searchTerm]);

  function handleFolderClick(companyId: string, companyName: string) {
    void navigate({ to: '/archivio', search: { companyId, companyName } });
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearchTerm('');
      }}
    >
      <PopoverTrigger
        openOnHover
        delay={150}
        closeDelay={150}
        aria-label="Le tue raccolte"
        title="Le tue raccolte"
        render={
          <button
            type="button"
            className={cn(
              'flex items-center justify-center rounded-lg px-2 py-2 transition-colors hover:bg-accent/50 hover:text-foreground',
              activeCompanyId ? 'text-foreground' : 'text-muted-foreground',
            )}
          />
        }
      >
        <Folder className="h-5 w-5 shrink-0" />
      </PopoverTrigger>

      <PopoverContent side="right" align="start" sideOffset={8} className="w-64 p-0">
        <div className="p-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cerca azienda..."
              className="h-8 pl-8 text-sm"
            />
          </div>
        </div>

        <Separator />

        <div className="max-h-[60vh] overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="px-2 py-3 text-center text-sm text-muted-foreground">
              {searchTerm ? 'Nessun risultato' : 'Nessuna azienda'}
            </p>
          ) : (
            filtered.map((company) => (
              <SidebarFolderItem
                key={company.id}
                name={company.name}
                isActive={activeCompanyId === company.id}
                collapsed={false}
                onClick={() => handleFolderClick(company.id, company.name)}
              />
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
