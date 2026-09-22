import { createFileRoute } from '@tanstack/react-router';
import { PageDetailLayout } from '@/components/templates/page-detail-layout';

export const Route = createFileRoute('/_dashboard/archivio/$pageId')({
  component: ArchivioDetailPage,
});

function ArchivioDetailPage() {
  const { pageId } = Route.useParams();
  return <PageDetailLayout pageId={pageId} />;
}
