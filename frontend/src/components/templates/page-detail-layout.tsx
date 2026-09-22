import { lazy, Suspense, useCallback, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetJobsGroupsSummaryQueryKey,
  useGetJobsGroupsSummary,
} from '@/generated/api/jobs/jobs';
import { extractArray } from '@/lib/api-response';
import { ResizablePanelLayout } from '@/components/molecules/resizable-panel-layout';
const PdfViewer = lazy(() => import('@/components/molecules/pdf-viewer').then((m) => ({ default: m.PdfViewer })));
import { DocumentDataPanel } from '@/components/organisms/document-data-panel';
import { FieldsMasterDetail } from '@/components/organisms/fields-master-detail';
import { ProductionUnitsMasterDetail } from '@/components/organisms/production-units-master-detail';
import { ProductsMasterDetail } from '@/components/organisms/products-master-detail';
import { SalesMasterDetail } from '@/components/organisms/sales-master-detail';
import { JobsMasterDetail } from '@/components/organisms/jobs-master-detail';
import { CompanyDashboard } from '@/components/organisms/company-dashboard';
import { FieldNotesMasterDetail } from '@/components/organisms/field-notes-master-detail';
import { LabelDetailView } from '@/components/organisms/labels/label-detail-view';
import { PendingJobBanner } from '@/components/molecules/pending-job-banner';
import { extractionKeys, useExtraction } from '@/hooks/use-extractions';
import { isPreviewableFile } from '@/lib/file-preview';

interface PageDetailLayoutProps {
  readonly pageId: string;
}

export function PageDetailLayout({ pageId }: PageDetailLayoutProps) {
  if (pageId.startsWith('label-')) {
    return (
      <DetailPageFrame>
        <LabelDetailView labelId={pageId.replace('label-', '')} />
      </DetailPageFrame>
    );
  }
  const extractionId = getExtractionIdFromPageId(pageId);
  if (extractionId) {
    return <ExtractionDetailView extractionId={extractionId} />;
  }
  if (pageId.startsWith('fields-')) {
    return (
      <DetailPageFrame>
        <FieldsMasterDetail companyId={pageId.replace('fields-', '')} />
      </DetailPageFrame>
    );
  }
  if (pageId.startsWith('pu-')) {
    return (
      <DetailPageFrame>
        <ProductionUnitsMasterDetail companyId={pageId.replace('pu-', '')} />
      </DetailPageFrame>
    );
  }
  if (pageId.startsWith('products-')) {
    return (
      <DetailPageFrame>
        <ProductsMasterDetail companyId={pageId.replace('products-', '')} />
      </DetailPageFrame>
    );
  }
  if (pageId.startsWith('sales-')) {
    return (
      <DetailPageFrame>
        <SalesMasterDetail companyId={pageId.replace('sales-', '')} />
      </DetailPageFrame>
    );
  }
  if (pageId.startsWith('field-notes-')) {
    return (
      <DetailPageFrame>
        <FieldNotesMasterDetail companyId={pageId.replace('field-notes-', '')} />
      </DetailPageFrame>
    );
  }
  if (pageId.startsWith('company-')) {
    return (
      <DetailPageFrame>
        <CompanyDashboard companyId={pageId.replace('company-', '')} />
      </DetailPageFrame>
    );
  }
  if (pageId.startsWith('job-')) {
    return <DosageJobProgressDetail jobId={pageId.replace('job-', '')} />;
  }
  if (pageId.startsWith('jobs-')) {
    const groupedJobMatch = pageId.match(/^jobs-([0-9a-f-]{36})-(.+)$/i);
    if (groupedJobMatch) {
      const [, companyId, encodedJobId] = groupedJobMatch;
      return <JobsMasterDetail companyId={companyId} initialJobId={decodeURIComponent(encodedJobId)} />;
    }
    return <JobsMasterDetail companyId={pageId.replace('jobs-', '')} />;
  }
  if (pageId.startsWith('generated-job_group-')) {
    const legacyGroupMatch = pageId.match(/^generated-job_group-([0-9a-f-]{36})-/i);
    if (legacyGroupMatch) {
      return <JobsMasterDetail companyId={legacyGroupMatch[1]} />;
    }
  }
  if (pageId.startsWith('generated-company-')) {
    const legacyCompanyMatch = pageId.match(/^generated-company-([0-9a-f-]{36})-/i);
    if (legacyCompanyMatch) {
      return (
        <DetailPageFrame>
          <CompanyDashboard companyId={legacyCompanyMatch[1]} />
        </DetailPageFrame>
      );
    }
  }
  if (pageId.startsWith('generated-fields-')) {
    const legacyFieldsMatch = pageId.match(/^generated-fields-([0-9a-f-]{36})-/i);
    if (legacyFieldsMatch) {
      return (
        <DetailPageFrame>
          <FieldsMasterDetail companyId={legacyFieldsMatch[1]} />
        </DetailPageFrame>
      );
    }
  }
  if (pageId.startsWith('generated-production_units-')) {
    const legacyProductionUnitMatch = pageId.match(/^generated-production_units-([0-9a-f-]{36})-/i);
    if (legacyProductionUnitMatch) {
      return (
        <DetailPageFrame>
          <ProductionUnitsMasterDetail companyId={legacyProductionUnitMatch[1]} />
        </DetailPageFrame>
      );
    }
  }
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      Pagina non trovata
    </div>
  );
}

function DetailPageFrame({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {children}
    </div>
  );
}

function DosageJobProgressDetail({ jobId }: { readonly jobId: string }) {
  const queryClient = useQueryClient();
  const [completed, setCompleted] = useState(false);
  const groupsQuery = useGetJobsGroupsSummary({
    query: {
      refetchInterval: completed ? false : 5000,
    },
  });
  const groupCompanyId = useMemo(
    () => findCompanyIdForJobGroup(groupsQuery.data?.data, jobId),
    [groupsQuery.data, jobId],
  );
  const handleCompleted = useCallback(() => {
    setCompleted(true);
    void queryClient.invalidateQueries({ queryKey: extractionKeys.lists() });
    void queryClient.invalidateQueries({ queryKey: getGetJobsGroupsSummaryQueryKey() });
  }, [queryClient]);

  if (groupCompanyId) {
    return <JobsMasterDetail companyId={groupCompanyId} initialJobId={jobId} />;
  }

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <PendingJobBanner jobId={jobId} onCompleted={handleCompleted} />
        <p className="mt-3 text-sm text-muted-foreground">
          Il gruppo operazioni comparirà in archivio appena la generazione sarà completata.
        </p>
      </div>
    </div>
  );
}

function findCompanyIdForJobGroup(raw: unknown, jobId: string): string | null {
  const groups = extractArray(raw, 'groups');
  const group = groups.find((item) => String(item.jobId ?? '') === jobId);
  if (!group) return null;
  const company = group.company && typeof group.company === 'object'
    ? (group.company as Record<string, unknown>)
    : null;
  const companyId = String(company?.id ?? group.companyId ?? '').trim();
  return companyId.length > 0 ? companyId : null;
}

function getExtractionIdFromPageId(pageId: string): string | null {
  if (pageId.startsWith('extraction-')) {
    return pageId.replace('extraction-', '');
  }
  if (isUuid(pageId)) {
    return pageId;
  }
  return null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function ExtractionDetailView({ extractionId }: { readonly extractionId: string }) {
  const { data: extraction, isLoading } = useExtraction(extractionId);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Caricamento...
      </div>
    );
  }
  if (!extraction) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Estrazione non trovata
      </div>
    );
  }

  if (!isPreviewableFile(extraction.fileName)) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <DocumentDataPanel extraction={extraction} />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <ResizablePanelLayout
        defaultSizes={[55, 45]}
        mobileMode="tabs"
        leftLabel="Documento"
        rightLabel="Dati"
        left={<Suspense fallback={null}><PdfViewer url={extraction.fileUrl ?? undefined} fileName={extraction.fileName} /></Suspense>}
        right={<DocumentDataPanel extraction={extraction} />}
      />
    </div>
  );
}
