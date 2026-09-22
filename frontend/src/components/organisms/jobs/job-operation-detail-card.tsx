import { Bot, Calendar, Leaf, Package, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { sanitizeUserFacingText } from '@/lib/safe-display';
import { toText } from './job-detail-text';
import { hasAny, type AlertNotes } from './alert-notes-helpers';
import { formatDateForView } from './mappers';
import {
  ConformitaSection,
  DoseSection,
  FasceSection,
  MagazzinoSection,
  MalattieSection,
  ModalitaSection,
} from './job-operation-detail-sections';
import {
  CompanyUnitFieldsSection,
  ContextSection,
  FrasiPericoloSection,
  LeftoverAlertsSection,
  ProductsSection,
} from './job-operation-detail-meta-sections';
import { RegoleApplicateSection } from './regole-applicate-section';
import type { AppliedRulePayload } from '@/types/applied-rules';
import { KNOWN_ALERT_KEYS, SECTION_KEYS } from './alert-notes-keys';
import type { JobOperationRow } from './types';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function statusDotClass(isVerified: boolean, conformityChecked: boolean): string {
  if (isVerified) return 'bg-emerald-500';
  if (conformityChecked) return 'bg-red-500';
  return 'bg-amber-500';
}

export function JobOperationDetailCard({
  operation,
  onDeselect,
}: {
  readonly operation: JobOperationRow;
  readonly onDeselect: (operationId: string) => void;
}) {
  const raw = operation.raw;
  const job = asRecord(raw.job) ?? raw;
  const company = asRecord(raw.company);
  const productionUnit = asRecord(raw.productionUnit);
  const machine = asRecord(raw.machine);
  const products = Array.isArray(raw.products) ? raw.products : [];
  const fields = Array.isArray(raw.fields) ? raw.fields : [];
  const historyCount = Array.isArray(job.history) ? job.history.length : job.history ? 1 : 0;
  const alertNotes = asRecord(job.alertNotes) as AlertNotes | null;
  const appliedRules = Array.isArray(job.appliedRules)
    ? (job.appliedRules as ReadonlyArray<AppliedRulePayload>)
    : [];
  const isVerified = job.isVerified === true;
  const conformity = job.conformityChecked === true;
  const noteText = job.note ? toText(job.note) : '';
  const noteLower = noteText.toLowerCase();
  const stockMention = /stock|scorte|insufficiente|magazzino/.test(noteLower);
  const warehouseAlertDot =
    Boolean(alertNotes?.excluded_product) || stockMention || hasAny(alertNotes, SECTION_KEYS.magazzino);
  const firstProduct = products.length > 0 ? asRecord(products[0]) : null;
  const dateLabel = formatDateForView(toText(job.dateOfOpeation ?? job.dateOfOperation));
  const qtyLine = `${toText(job.quantity)} ${toText(job.unitOfMeasureQuantity)}`.trim();
  const perHaLine = `${toText(job.productQuantityTreated)} ${toText(job.unitOfMeasureProductQuantityTreated)}`.trim();

  const leftover = alertNotes
    ? Object.keys(alertNotes).filter((k) => !KNOWN_ALERT_KEYS.has(k) && !k.endsWith('_um'))
    : [];

  return (
    <Card size="sm" className="shadow-sm">
      <CardHeader className="space-y-3 border-b pb-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span
                className={`inline-block size-2.5 shrink-0 rounded-full ${statusDotClass(isVerified, conformity)}`}
                title={isVerified ? 'Verificata' : conformity ? 'Non verificata' : 'Conformità non verificata'}
              />
              <Calendar className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="font-medium">{dateLabel}</span>
              <Badge variant="secondary" className="font-mono text-xs">
                {toText(job.jobId)}
              </Badge>
            </div>
            <div className="flex items-start gap-2 text-sm">
              <Leaf className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="wrap-break-word">
                <span className="font-medium">{toText(productionUnit?.name)}</span>
                {company?.name ? (
                  <span className="text-muted-foreground"> — {toText(company.name)}</span>
                ) : null}
              </span>
            </div>
            <div className="flex items-start gap-2 text-sm">
              <Package className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="wrap-break-word">
                {firstProduct?.name ? (
                  <span className="font-medium">{toText(firstProduct.name)}</span>
                ) : (
                  <span className="text-muted-foreground">Nessun prodotto associato</span>
                )}
              </span>
            </div>
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{qtyLine || '—'}</span>
              {perHaLine.replace(/[\s—-]/g, '').length > 0 ? (
                <span>
                  {' '}
                  | <span className="text-foreground">{perHaLine}</span>
                </span>
              ) : null}
            </div>
          </div>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="shrink-0"
            onClick={() => onDeselect(operation.id)}
            title="Deseleziona"
            aria-label="Deseleziona operazione"
          >
            <X />
          </Button>
        </div>

        {noteText ? (
          <div className="rounded-lg border border-violet-200/90 bg-violet-50/90 px-3 py-2.5 text-sm text-violet-950">
            <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-violet-800">
              <Bot className="size-3.5 shrink-0" aria-hidden />
              Note operative / sistema
            </div>
            <p className="whitespace-pre-wrap wrap-break-word leading-relaxed">{sanitizeUserFacingText(noteText)}</p>
          </div>
        ) : null}
      </CardHeader>

      <CardContent className="px-0 pb-1 pt-0">
        <div className="px-4 pt-2">
          <DoseSection job={job} alertNotes={alertNotes} />
          <ModalitaSection job={job} alertNotes={alertNotes} machine={machine} />
          <MagazzinoSection alertNotes={alertNotes} stockMention={stockMention} showAlertDot={warehouseAlertDot} />
          <MalattieSection job={job} alertNotes={alertNotes} />
          <FasceSection job={job} alertNotes={alertNotes} />
          <ConformitaSection job={job} alertNotes={alertNotes} isVerified={isVerified} conformity={conformity} />
          <RegoleApplicateSection appliedRules={appliedRules} />
          <CompanyUnitFieldsSection
            job={job}
            company={company}
            productionUnit={productionUnit}
            fields={fields}
          />
          <ProductsSection products={products} />
          <ContextSection job={job} raw={raw} historyCount={historyCount} />
          {alertNotes && hasAny(alertNotes, SECTION_KEYS.pericolo) ? (
            <FrasiPericoloSection alertNotes={alertNotes} />
          ) : null}
          {alertNotes && leftover.length > 0 ? (
            <LeftoverAlertsSection alertNotes={alertNotes} keys={leftover} />
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
