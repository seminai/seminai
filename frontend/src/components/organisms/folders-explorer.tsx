import { useMemo, useState } from 'react';
import { useCompanies } from '@/hooks/use-company-options';
import { useExtractionsList } from '@/hooks/use-extractions';
import { useTabs } from '@/hooks/use-tabs';
import {
  formatCompanyWithJobGroupCode,
  formatJobGroupTitle,
  parseJobGroupCodeFromGeneratedId,
} from '@/lib/job-group-format';
import type { SelectedNode } from '@/components/organisms/folders-explorer.types';
import { CompanyTreeNode } from '@/components/organisms/folders-company-tree-node';

interface FoldersExplorerProps {
  readonly initialCompanyId?: string;
}

const CATEGORY_FILTERS = [
  { value: 'all', label: 'Tutte le cartelle' },
  { value: 'generated:company', label: 'Azienda' },
  { value: 'extraction:fields', label: 'Campi' },
  { value: 'extraction:production_units', label: 'Unita produttive' },
  { value: 'generated:job_group', label: 'Operazioni confermate' },
  { value: 'extraction:stock', label: 'Magazzino' },
] as const;

export function FoldersExplorer({ initialCompanyId }: FoldersExplorerProps) {
  const { addTab } = useTabs();
  const { companies, isLoading } = useCompanies();
  const { data: allExtractions } = useExtractionsList({
    page: 1,
    pageSize: 300,
    includeGenerated: true,
    sortBy: 'updatedAt',
    sortOrder: 'desc',
  });
  const [expandedCompanyIds, setExpandedCompanyIds] = useState<ReadonlySet<string>>(
    () => new Set(initialCompanyId ? [initialCompanyId] : []),
  );
  const [expandedCategoryKeys, setExpandedCategoryKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [selectedNode, setSelectedNode] = useState<SelectedNode>(() =>
    initialCompanyId
      ? { type: 'company', companyId: initialCompanyId, companyName: initialCompanyId }
      : { type: 'none' },
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const treeCompanies = useMemo(() => {
    const base = companies.map((company) => ({ id: company.id, name: company.name }));
    if (base.length > 0) return base;
    const items = allExtractions?.items ?? [];
    const seen = new Set<string>();
    const fallback: Array<{ readonly id: string; readonly name: string }> = [];
    for (const item of items) {
      if (!item.companyId || seen.has(item.companyId)) continue;
      seen.add(item.companyId);
      fallback.push({ id: item.companyId, name: item.companyName || `Azienda ${fallback.length + 1}` });
    }
    return fallback;
  }, [allExtractions?.items, companies]);
  const visibleCompanies = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return treeCompanies;
    return treeCompanies.filter((company) => company.name.toLowerCase().includes(term));
  }, [searchTerm, treeCompanies]);
  const selectedCompanyNameById = useMemo(
    () => new Map(treeCompanies.map((company) => [company.id, company.name])),
    [treeCompanies],
  );

  function toggleCompany(companyId: string) {
    setExpandedCompanyIds((previous) => {
      const next = new Set(previous);
      if (next.has(companyId)) next.delete(companyId);
      else next.add(companyId);
      return next;
    });
  }

  function toggleCategory(companyId: string, categoryKey: string) {
    const stateKey = `${companyId}:${categoryKey}`;
    setExpandedCategoryKeys((previous) => {
      const next = new Set(previous);
      if (next.has(stateKey)) next.delete(stateKey);
      else next.add(stateKey);
      return next;
    });
  }

  function openTabFromNode(node: SelectedNode) {
    const base = {
      source: 'archivio' as const,
      subtitle:
        node.type === 'item'
          ? node.companyName
          : node.type === 'category'
            ? node.companyName
            : node.type === 'company'
              ? node.companyName
              : undefined,
      format: '-',
    };
    if (node.type === 'company') {
      addTab({ id: `company-${node.companyId}`, title: node.companyName, ...base });
      return;
    }
    if (node.type === 'category') {
      const map: Record<string, string> = {
        'generated:company': `company-${node.companyId}`,
        'extraction:fields': `fields-${node.companyId}`,
        'generated:fields': `fields-${node.companyId}`,
        'extraction:production_units': `pu-${node.companyId}`,
        'generated:production_units': `pu-${node.companyId}`,
        'generated:job_group': `jobs-${node.companyId}`,
        'extraction:stock': `products-${node.companyId}`,
        'generated:products': `products-${node.companyId}`,
      };
      const tabId = map[node.categoryKey];
      if (!tabId) return;
      addTab({ id: tabId, title: node.categoryLabel, ...base });
      return;
    }
    if (node.type === 'item') {
      if (node.item.kind === 'extraction') {
        const ext = node.item.fileName.split('.').pop();
        addTab({
          id: node.item.id,
          title: node.item.fileName,
          subtitle: node.companyName,
          format: ext ? `.${ext}` : '-',
          source: 'archivio',
        });
        return;
      }
      const generatedTypeMap: Record<string, string> = {
        company: `company-${node.item.companyId}`,
        fields: `fields-${node.item.companyId}`,
        production_units: `pu-${node.item.companyId}`,
        job_group: `jobs-${node.item.companyId}`,
        products: `products-${node.item.companyId}`,
      };
      const mappedId = generatedTypeMap[node.item.generatedType ?? 'company'];
      const isJobGroupItem = node.item.generatedType === 'job_group';
      const jobGroupCode = isJobGroupItem ? parseJobGroupCodeFromGeneratedId(node.item.id) : null;
      addTab({
        id: mappedId ?? node.item.id,
        title: isJobGroupItem ? formatJobGroupTitle(jobGroupCode) : node.categoryLabel,
        subtitle: isJobGroupItem
          ? formatCompanyWithJobGroupCode(node.companyName, jobGroupCode)
          : node.companyName,
        format: '-',
        source: 'archivio',
      });
    }
  }

  return (
    <div className="flex h-full min-h-0 w-full gap-4 p-3 md:p-6">
      <section className="flex min-h-0 w-full max-w-md flex-col rounded-lg border bg-card">
        <header className="border-b px-3 py-2">
          <h1 className="text-sm font-semibold">File system cartelle</h1>
          <p className="text-xs text-muted-foreground">Azienda / categoria / file</p>
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Cerca azienda o file"
              className="h-8 flex-1 rounded-md border bg-background px-2 text-xs outline-none"
            />
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="h-8 rounded-md border bg-background px-2 text-xs outline-none"
            >
              {CATEGORY_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {isLoading && <p className="text-sm text-muted-foreground">Caricamento aziende...</p>}
          {!isLoading && visibleCompanies.length === 0 && (
            <p className="text-sm text-muted-foreground">Nessuna azienda disponibile.</p>
          )}
          <div className="flex flex-col gap-1">
            {visibleCompanies.map((company) => (
              <CompanyTreeNode
                key={company.id}
                companyId={company.id}
                companyName={company.name}
                expanded={expandedCompanyIds.has(company.id)}
                selectedNode={selectedNode}
                expandedCategoryKeys={expandedCategoryKeys}
                onToggleCompany={toggleCompany}
                onToggleCategory={toggleCategory}
                onSelectNode={setSelectedNode}
                onOpenNode={openTabFromNode}
                searchTerm={searchTerm}
                categoryFilter={categoryFilter}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="flex min-h-0 flex-1 flex-col rounded-lg border bg-card p-4">
        {selectedNode.type === 'none' && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Seleziona una cartella a sinistra per vedere i dettagli.
          </div>
        )}
        {selectedNode.type === 'company' && (
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">
              {selectedCompanyNameById.get(selectedNode.companyId) ?? selectedNode.companyName}
            </h2>
            <p className="text-sm text-muted-foreground">Nodo azienda selezionato.</p>
          </div>
        )}
        {selectedNode.type === 'category' && (
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">{selectedNode.categoryLabel}</h2>
            <p className="text-sm text-muted-foreground">{selectedNode.companyName}</p>
            <p className="text-sm text-muted-foreground">Elementi nella cartella: {selectedNode.count}</p>
          </div>
        )}
        {selectedNode.type === 'item' && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">{selectedNode.item.fileName}</h2>
            <p className="text-sm text-muted-foreground">Azienda: {selectedNode.companyName}</p>
            <p className="text-sm text-muted-foreground">Categoria: {selectedNode.categoryLabel}</p>
            <p className="text-sm text-muted-foreground">Stato: {String(selectedNode.item.status)}</p>
            <p className="text-sm text-muted-foreground">Ultimo aggiornamento: {selectedNode.item.updatedAt}</p>
          </div>
        )}
      </section>
    </div>
  );
}
