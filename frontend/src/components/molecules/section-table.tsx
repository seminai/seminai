import type { ReactNode } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TruncatedText } from '@/components/atoms/truncated-text';

interface SectionProps {
  readonly title: string;
  readonly count?: number;
  readonly action?: ReactNode;
  readonly children: ReactNode;
}

export function Section({ title, count, action, children }: SectionProps) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {title}
          {count !== undefined && (
            <span className="ml-1 font-normal text-muted-foreground">({count})</span>
          )}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

interface SimpleTableProps {
  readonly headers: readonly string[];
  readonly rows: readonly ReactNode[][];
}

function renderSimpleCell(cell: ReactNode) {
  if (typeof cell === 'string' || typeof cell === 'number') {
    return <TruncatedText text={String(cell)} maxWidth="100%" />;
  }
  return cell;
}

export function SimpleTable({ headers, rows }: SimpleTableProps) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((h) => (
              <TableHead key={h} className="h-9 text-xs">
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i}>
              {row.map((cell, j) => (
                <TableCell key={j} className="py-2 text-sm">
                  {renderSimpleCell(cell)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function EmptyState() {
  return (
    <p className="py-6 text-center text-sm text-muted-foreground">Non ci sono dati</p>
  );
}
