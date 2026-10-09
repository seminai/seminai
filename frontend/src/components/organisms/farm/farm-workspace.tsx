import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { BookOpen, ArrowDownToLine, ArrowUpFromLine, CheckCheck, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCompanies } from '@/hooks/use-company-options';
import { useFarmCatalog, useFarmOperations } from '@/hooks/use-farm';
import type { FarmRecord, Product } from '@/services/farm-api';
import { OperationHistory } from './operation-history';
import { OperationForm } from './operation-form';
import { OperationReview } from './operation-review';
import { jobCategoryIt } from '@/components/organisms/jobs/job-detail-italian-labels';
export function FarmWorkspace() {
  const { companies, isLoading } = useCompanies();
  const [selectedCompany, setSelectedCompany] = useState('');
  const companyId = selectedCompany || companies[0]?.id || '';
  const [tab, setActiveTab] = useState('jobs');
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const setTab = (value: string) => {
    setActiveTab(value);
    setPage(0);
    setSearch('');
  };
  const [mode, setMode] = useState<'IN' | 'OUT' | 'JOB' | null>(null);
  const records = useFarmCatalog<FarmRecord>(
    companyId,
    ['review', 'history'].includes(tab) ? 'jobs' : tab,
    page,
    search,
  );
  const operations = useFarmOperations(companyId, tab !== 'history', page);
  const pending = operations.data?.filter((item) => item.status === 'pending') ?? [];
  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 overflow-y-auto p-4 pb-24 sm:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-emerald-700">
            Seminai · Quaderno di campagna
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Il lavoro in campo, giorno per giorno.
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Attività, prodotti e giacenze della tua azienda.
          </p>
        </div>
        <select
          aria-label="Azienda"
          className="h-10 max-w-full rounded-md border bg-background px-3"
          value={companyId}
          onChange={(event) => {
            setSelectedCompany(event.target.value);
            setMode(null);
            setPage(0);
          }}
        >
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </select>
      </header>
      {isLoading && <p role="status">Caricamento aziende…</p>}
      {!isLoading && !companyId && (
        <section className="rounded-xl border border-dashed p-8">
          <h2 className="text-xl font-semibold">Inizia dalla tua azienda</h2>
          <p className="my-3 text-muted-foreground">
            Aggiungi azienda, appezzamenti e prodotti con i moduli manuali.
          </p>
          <Link
            className="text-primary underline"
            to="/add-data"
            search={{ type: 'manual', entity: 'companies' }}
          >
            Aggiungi azienda
          </Link>
        </section>
      )}
      {companyId && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setMode('JOB')}>
              <Plus className="mr-2 h-4 w-4" />
              Registra attività
            </Button>
            <Button variant="outline" onClick={() => setMode('IN')}>
              <ArrowDownToLine className="mr-2 h-4 w-4" />
              Carico
            </Button>
            <Button variant="outline" onClick={() => setMode('OUT')}>
              <ArrowUpFromLine className="mr-2 h-4 w-4" />
              Scarico
            </Button>
            <Link className="text-primary underline" to="/add-data">
              Aggiungi dati
            </Link>
          </div>
          {mode && (
            <OperationForm
              key={`${companyId}-${mode}`}
              companyId={companyId}
              mode={mode}
              onDone={() => {
                setMode(null);
                setTab('review');
              }}
            />
          )}
          <nav className="flex flex-wrap gap-2 border-b pb-3" aria-label="Quaderno">
            <Button variant={tab === 'jobs' ? 'secondary' : 'ghost'} onClick={() => setTab('jobs')}>
              <BookOpen className="mr-2 h-4 w-4" />
              Quaderno
            </Button>
            {[
              ['fields', 'Appezzamenti'],
              ['products', 'Prodotti'],
              ['movements', 'Magazzino'],
              ['history', 'Storico'],
            ].map(([value, label]) => (
              <Button
                key={value}
                variant={tab === value ? 'secondary' : 'ghost'}
                onClick={() => setTab(value)}
              >
                {label}
              </Button>
            ))}
            <Button
              variant={tab === 'review' ? 'secondary' : 'ghost'}
              onClick={() => setTab('review')}
            >
              <CheckCheck className="mr-2 h-4 w-4" />
              Da confermare{pending.length ? ` (${pending.length})` : ''}
            </Button>
            <Link className="text-primary underline" to="/archivio">
              Documenti
            </Link>
          </nav>
          {!['review', 'history', 'jobs'].includes(tab) && (
            <input
              aria-label="Cerca nei dati"
              className="h-10 w-full rounded-md border bg-background px-3"
              placeholder="Cerca per nome"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(0);
              }}
            />
          )}
          {(records.isLoading || operations.isLoading) && <p role="status">Caricamento…</p>}
          {(records.isError || operations.isError) && (
            <div role="alert">
              Impossibile caricare i dati.{' '}
              <Button
                variant="outline"
                onClick={() => {
                  void records.refetch();
                  void operations.refetch();
                }}
              >
                Riprova
              </Button>
            </div>
          )}
          {tab === 'history' ? (
            <div className="space-y-4">
              {!operations.data?.length && <p>Nessuna operazione registrata.</p>}
              {operations.data?.map((operation) => (
                <OperationHistory key={operation.id} operation={operation} companyId={companyId} />
              ))}
            </div>
          ) : tab === 'review' ? (
            <div className="space-y-4">
              {!pending.length && (
                <p className="rounded-xl border border-dashed p-8 text-muted-foreground">
                  Nessuna operazione da confermare.
                </p>
              )}
              {pending.map((operation) => (
                <OperationReview
                  key={`${operation.id}-${operation.version}`}
                  companyId={companyId}
                  operation={operation}
                />
              ))}
            </div>
          ) : (
            <div className="divide-y rounded-xl border">
              {!records.isLoading && !records.data?.length && (
                <p className="p-8 text-muted-foreground">
                  Ancora nessuna registrazione. Aggiungi dati o registra la prima attività.
                </p>
              )}
              {records.data?.map((record) => (
                <article
                  key={record.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-4"
                >
                  <div>
                    <h3 className="font-medium">
                      {record.product?.name ||
                        record.productionUnit?.name ||
                        record.name ||
                        record.category}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {record.reason ||
                        (tab === 'jobs' ? jobCategoryIt(record.category || '') : record.category) ||
                        ''}{' '}
                      {(record.occurredAt || record.dateOfOpeation) &&
                        `· ${new Date(record.occurredAt || record.dateOfOpeation || '').toLocaleDateString('it-IT')}`}
                    </p>
                  </div>
                  <span className="text-sm tabular-nums">
                    {record.quantity !== undefined
                      ? `${record.quantity} ${record.unitOfMeasureQuantity || ''}`
                      : tab === 'products'
                        ? stockLabel(
                            (records.data as unknown as Product[])?.find(
                              (item) => item.id === record.id,
                            ),
                          )
                        : ''}
                  </span>
                </article>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <Button variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
              Precedenti
            </Button>
            <span className="text-xs text-muted-foreground">
              Pagina {page + 1} · fino a 100 risultati
            </span>
            <Button
              variant="outline"
              disabled={
                (['review', 'history'].includes(tab)
                  ? operations.data?.length
                  : records.data?.length) !== 100
              }
              onClick={() => setPage(page + 1)}
            >
              Successivi
            </Button>
          </div>
        </>
      )}
    </main>
  );
}
function stockLabel(product?: Product): string {
  const units = new Map<string, number>();
  for (const row of product?.stocks ?? []) {
    const unit = row.unitMeasureConverted ?? row.unitOfMeasureQuantity;
    const quantity = row.quantityConverted ?? row.quantity;
    units.set(unit, (units.get(unit) || 0) + (row.type === 'OUT' ? -Math.abs(quantity) : quantity));
  }
  return (
    [...units].map(([unit, value]) => `${value.toLocaleString('it-IT')} ${unit}`).join(' · ') ||
    'Nessun movimento'
  );
}
