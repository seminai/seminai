import { useMemo } from 'react';
import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen } from 'lucide-react';
import { useExtractionsList } from '@/hooks/use-extractions';
import { cn } from '@/lib/utils';
import { groupByCategory } from '@/components/organisms/folders-explorer.utils';
import type { SelectedNode } from '@/components/organisms/folders-explorer.types';

interface CompanyTreeNodeProps {
  readonly companyId: string;
  readonly companyName: string;
  readonly expanded: boolean;
  readonly selectedNode: SelectedNode;
  readonly expandedCategoryKeys: ReadonlySet<string>;
  readonly onToggleCompany: (companyId: string) => void;
  readonly onToggleCategory: (companyId: string, categoryKey: string) => void;
  readonly onSelectNode: (node: SelectedNode) => void;
  readonly onOpenNode: (node: SelectedNode) => void;
  readonly searchTerm: string;
  readonly categoryFilter: string;
}

export function CompanyTreeNode({
  companyId,
  companyName,
  expanded,
  selectedNode,
  expandedCategoryKeys,
  onToggleCompany,
  onToggleCategory,
  onSelectNode,
  onOpenNode,
  searchTerm,
  categoryFilter,
}: CompanyTreeNodeProps) {
  const { data, isLoading, isError } = useExtractionsList(
    {
      companyId,
      page: 1,
      pageSize: 250,
      includeGenerated: true,
      sortBy: 'updatedAt',
      sortOrder: 'desc',
    },
    expanded,
  );

  const groups = useMemo(() => groupByCategory(data?.items ?? []), [data?.items]);
  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const visibleGroups = useMemo(
    () =>
      groups.flatMap((group) => {
        if (categoryFilter !== 'all' && group.key !== categoryFilter) return [];
        if (!normalizedSearchTerm) return [group];
        const companyMatch = companyName.toLowerCase().includes(normalizedSearchTerm);
        const categoryMatch = group.label.toLowerCase().includes(normalizedSearchTerm);
        if (companyMatch || categoryMatch) return [group];
        const matchingItems = group.items.filter((item) =>
          item.fileName.toLowerCase().includes(normalizedSearchTerm),
        );
        if (matchingItems.length === 0) return [];
        return [{ ...group, items: matchingItems }];
      }),
    [categoryFilter, companyName, groups, normalizedSearchTerm],
  );

  const isCompanySelected = selectedNode.type === 'company' && selectedNode.companyId === companyId;

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => {
          const node: SelectedNode = { type: 'company', companyId, companyName };
          onSelectNode(node);
          onOpenNode(node);
        }}
        className={cn(
          'flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
          isCompanySelected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
        )}
      >
        <span
          role="button"
          tabIndex={0}
          onClick={(event) => {
            event.stopPropagation();
            onToggleCompany(companyId);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onToggleCompany(companyId);
            }
          }}
          className="flex shrink-0"
          aria-label={expanded ? 'Comprimi azienda' : 'Espandi azienda'}
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
        {expanded ? <FolderOpen className="h-4 w-4 shrink-0" /> : <Folder className="h-4 w-4 shrink-0" />}
        <span className="truncate">{companyName}</span>
      </button>

      {expanded && (
        <div className="ml-7 mt-1 flex flex-col gap-0.5 border-l pl-2">
          {isLoading && <span className="px-2 py-1 text-xs text-muted-foreground">Caricamento cartelle...</span>}
          {isError && <span className="px-2 py-1 text-xs text-destructive">Errore nel caricamento dei file</span>}
          {!isLoading && !isError && visibleGroups.length === 0 && (
            <span className="px-2 py-1 text-xs text-muted-foreground">Nessuna cartella disponibile</span>
          )}
          {visibleGroups.map((group) => {
            const categoryStateKey = `${companyId}:${group.key}`;
            const categoryExpanded = expandedCategoryKeys.has(categoryStateKey);
            const isCategorySelected =
              selectedNode.type === 'category' &&
              selectedNode.companyId === companyId &&
              selectedNode.categoryKey === group.key;

            return (
              <div key={group.key} className="flex flex-col">
                <button
                  type="button"
                  onClick={() => {
                    const node: SelectedNode = {
                      type: 'category',
                      companyId,
                      companyName,
                      categoryKey: group.key,
                      categoryLabel: group.label,
                      count: group.items.length,
                    };
                    onSelectNode(node);
                    onOpenNode(node);
                  }}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2 py-1 text-left text-sm',
                    isCategorySelected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
                  )}
                >
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleCategory(companyId, group.key);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onToggleCategory(companyId, group.key);
                      }
                    }}
                    className="flex shrink-0"
                    aria-label={categoryExpanded ? 'Comprimi categoria' : 'Espandi categoria'}
                  >
                    {categoryExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <Folder className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{group.label}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{group.items.length}</span>
                </button>

                {categoryExpanded && (
                  <div className="ml-6 mt-0.5 flex flex-col gap-0.5">
                    {group.items.map((item) => {
                      const isItemSelected = selectedNode.type === 'item' && selectedNode.item.id === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            const node: SelectedNode = {
                              type: 'item',
                              companyId,
                              companyName,
                              categoryLabel: group.label,
                              item,
                            };
                            onSelectNode(node);
                            onOpenNode(node);
                          }}
                          className={cn(
                            'flex items-center gap-2 rounded-md px-2 py-1 text-left text-xs',
                            isItemSelected ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50',
                          )}
                        >
                          <FileText className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{item.fileName}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
