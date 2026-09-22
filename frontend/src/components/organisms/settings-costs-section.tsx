import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { customFetch } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface TokenUsage {
  readonly id: string;
  readonly model: string;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
  readonly costClient: number;
  readonly createdAt: string;
  readonly companyName?: string;
}

interface TokenCostsResponse {
  readonly status: string;
  readonly data: {
    readonly usages: readonly TokenUsage[];
    readonly totals: {
      readonly totalCostClient: number;
      readonly totalPromptTokens: number;
      readonly totalCompletionTokens: number;
      readonly totalTokens: number;
    };
  };
}

const MODEL_COLORS: Record<string, string> = {
  'gpt-4o': '#10b981',
  'gpt-4o-mini': '#6366f1',
  'gpt-4': '#f59e0b',
  'gpt-3.5-turbo': '#ef4444',
  'claude-3-opus': '#8b5cf6',
  'claude-3-sonnet': '#3b82f6',
  'claude-3-haiku': '#14b8a6',
};

function getModelColor(model: string, idx: number): string {
  const fallback = ['#10b981', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6', '#3b82f6', '#14b8a6', '#f97316'];
  return MODEL_COLORS[model] ?? fallback[idx % fallback.length] ?? '#888888';
}

export function SettingsCostsSection() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterCompany, setFilterCompany] = useState('all');
  const [filterModel, setFilterModel] = useState('all');

  const costsQuery = useQuery({
    queryKey: ['/get-token-costs'],
    queryFn: () =>
      customFetch<TokenCostsResponse>({ url: '/get-token-costs', method: 'GET' }),
  });

  const allUsages = costsQuery.data?.data?.usages ?? [];

  const companies = useMemo(
    () => [...new Set(allUsages.map((u) => u.companyName).filter(Boolean))] as string[],
    [allUsages],
  );
  const models = useMemo(
    () => [...new Set(allUsages.map((u) => u.model))],
    [allUsages],
  );

  const filtered = useMemo(() => {
    return allUsages.filter((u) => {
      if (dateFrom && u.createdAt < dateFrom) return false;
      if (dateTo && u.createdAt > `${dateTo}T23:59:59`) return false;
      if (filterCompany !== 'all' && u.companyName !== filterCompany) return false;
      if (filterModel !== 'all' && u.model !== filterModel) return false;
      return true;
    });
  }, [allUsages, dateFrom, dateTo, filterCompany, filterModel]);

  const monthlyData = useMemo(() => buildMonthlyData(filtered), [filtered]);
  const filteredModels = useMemo(
    () => (filterModel !== 'all' ? [filterModel] : models),
    [filterModel, models],
  );

  const totalCost = filtered.reduce((s, u) => s + u.costClient, 0);
  const totalTokens = filtered.reduce((s, u) => s + u.totalTokens, 0);

  if (costsQuery.isLoading) return <SectionState label="Caricamento costi..." />;
  if (costsQuery.isError) return <SectionState label="Errore durante il caricamento costi." />;

  return (
    <div className="space-y-6 p-5">
      <h2 className="text-lg font-semibold">Costi</h2>

      {/* Filters */}
      <Card size="sm">
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label>Data inizio</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Data fine</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            {companies.length > 0 && (
              <div className="space-y-1.5">
                <Label>Azienda</Label>
                <Select value={filterCompany} onValueChange={(v) => setFilterCompany(v ?? 'all')}>
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder="Tutte" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutte</SelectItem>
                    {companies.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Modello</Label>
              <Select value={filterModel} onValueChange={(v) => setFilterModel(v ?? 'all')}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Tutti" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti</SelectItem>
                  {models.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card size="sm">
          <CardContent>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Costo totale</p>
            <p className="mt-1 text-xl font-semibold">&euro; {totalCost.toFixed(4)}</p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Token totali</p>
            <p className="mt-1 text-xl font-semibold">{totalTokens.toLocaleString('it-IT')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Bar chart – monthly by model */}
      <Card>
        <CardHeader>
          <CardTitle>Costi mensili per modello</CardTitle>
        </CardHeader>
        <CardContent>
          {monthlyData.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nessun dato disponibile.</p>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `€${Number(v).toFixed(2)}`} />
                <Tooltip formatter={(v) => `€ ${Number(v).toFixed(4)}`} />
                <Legend />
                {filteredModels.map((model, idx) => (
                  <Bar key={model} dataKey={model} stackId="a" fill={getModelColor(model, idx)} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Line chart – cost over time by model */}
      <Card>
        <CardHeader>
          <CardTitle>Andamento costi per modello</CardTitle>
        </CardHeader>
        <CardContent>
          {monthlyData.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nessun dato disponibile.</p>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `€${Number(v).toFixed(2)}`} />
                <Tooltip formatter={(v) => `€ ${Number(v).toFixed(4)}`} />
                <Legend />
                {filteredModels.map((model, idx) => (
                  <Line
                    key={model}
                    type="monotone"
                    dataKey={model}
                    stroke={getModelColor(model, idx)}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Data table */}
      <Card>
        <CardHeader>
          <CardTitle>Dettaglio utilizzo</CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nessun dato disponibile.</p>
          ) : (
            <div className="max-h-[400px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Modello</TableHead>
                    <TableHead className="text-right">Prompt</TableHead>
                    <TableHead className="text-right">Completion</TableHead>
                    <TableHead className="text-right">Totale token</TableHead>
                    <TableHead className="text-right">Costo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>{formatDate(u.createdAt)}</TableCell>
                      <TableCell>{u.model}</TableCell>
                      <TableCell className="text-right">{u.promptTokens.toLocaleString('it-IT')}</TableCell>
                      <TableCell className="text-right">{u.completionTokens.toLocaleString('it-IT')}</TableCell>
                      <TableCell className="text-right">{u.totalTokens.toLocaleString('it-IT')}</TableCell>
                      <TableCell className="text-right">&euro; {u.costClient.toFixed(4)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Helpers ─── */

function toMonthKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface ChartRow {
  readonly month: string;
  [model: string]: string | number;
}

function buildMonthlyData(usages: readonly TokenUsage[]): ChartRow[] {
  const map = new Map<string, Record<string, string | number>>();
  for (const u of usages) {
    const key = toMonthKey(u.createdAt);
    const entry = map.get(key) ?? { month: key };
    entry[u.model] = ((entry[u.model] as number) ?? 0) + u.costClient;
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) =>
    (a.month as string).localeCompare(b.month as string),
  ) as ChartRow[];
}

function SectionState({ label }: { readonly label: string }) {
  return (
    <div className="flex min-h-[220px] items-center justify-center p-5 text-sm text-muted-foreground">
      {label}
    </div>
  );
}
