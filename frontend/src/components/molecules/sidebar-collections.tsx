import { useMemo, useRef, useState, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SidebarFolderItem } from '@/components/atoms/sidebar-folder-item';
import { SidebarCollectionsFlyout } from '@/components/molecules/sidebar-collections-flyout';
import { useSidebarCompanies } from '@/hooks/use-sidebar-companies';

const MAX_VISIBLE = 5;

interface SidebarCollectionsProps {
  readonly collapsed: boolean;
  readonly activeCompanyId: string | undefined;
}

export function SidebarCollections({ collapsed, activeCompanyId }: SidebarCollectionsProps) {
  const { companies: sorted } = useSidebarCompanies();
  const navigate = useNavigate();
  const [isSearching, setIsSearching] = useState(false);
  const [showAllCollections, setShowAllCollections] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isSearching) inputRef.current?.focus();
  }, [isSearching]);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return sorted;
    const term = searchTerm.toLowerCase();
    return sorted.filter((c) => c.name.toLowerCase().includes(term));
  }, [sorted, searchTerm]);

  function handleFolderClick(companyId: string, companyName: string) {
    void navigate({
      to: '/archivio',
      search: { companyId, companyName },
    });
  }

  function handleToggleSearch() {
    setIsSearching((prev) => {
      if (prev) setSearchTerm('');
      return !prev;
    });
  }

  function handleShowMore() {
    setShowAllCollections(true);
  }

  function handleShowLess() {
    setShowAllCollections(false);
  }

  // Collapsed: a single folder icon that opens a lateral flyout with search + list.
  if (collapsed) {
    return (
      <div className="mt-6 flex flex-col px-1">
        <SidebarCollectionsFlyout activeCompanyId={activeCompanyId} />
      </div>
    );
  }

  const isExpanded = isSearching || showAllCollections;
  const visible = isExpanded ? filtered : filtered.slice(0, MAX_VISIBLE);
  const hiddenCount = isExpanded ? 0 : Math.max(0, filtered.length - MAX_VISIBLE);

  return (
    <div className="mt-6 flex min-h-0 flex-1 flex-col gap-0.5 px-2">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        {isSearching ? (
          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cerca azienda..."
            className="h-5 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
          />
        ) : (
          <span className="text-xs font-medium tracking-wide text-muted-foreground">
            Le tue raccolte
          </span>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground"
          onClick={handleToggleSearch}
          aria-label={isSearching ? 'Chiudi ricerca' : 'Cerca azienda'}
        >
          {isSearching ? <X className="h-3.5 w-3.5" /> : <Search className="h-3.5 w-3.5" />}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-none group-hover:scrollbar-thin">
        {/* Folder list */}
        {visible.map((company) => (
          <SidebarFolderItem
            key={company.id}
            name={company.name}
            isActive={activeCompanyId === company.id}
            collapsed={false}
            onClick={() => handleFolderClick(company.id, company.name)}
          />
        ))}

        {/* "...altre N" */}
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={handleShowMore}
            className="px-3 py-1.5 text-left text-xs text-muted-foreground hover:text-foreground"
          >
            ...altre {hiddenCount}
          </button>
        )}
        {showAllCollections && !isSearching && filtered.length > MAX_VISIBLE && (
          <button
            type="button"
            onClick={handleShowLess}
            className="px-3 py-1.5 text-left text-xs text-muted-foreground hover:text-foreground"
          >
            ...mostra meno
          </button>
        )}

        {/* Empty state */}
        {visible.length === 0 && (
          <span className="px-3 py-2 text-xs text-muted-foreground">
            {searchTerm ? 'Nessun risultato' : 'Nessuna azienda'}
          </span>
        )}
      </div>
    </div>
  );
}
