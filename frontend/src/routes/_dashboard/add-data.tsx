import { createFileRoute, Navigate } from '@tanstack/react-router';
import { AddDataLanding } from '@/components/templates/add-data-landing';
import { NewFilesLayout } from '@/components/templates/new-files-layout';
import { PlanModePicker } from '@/components/templates/plan-mode-picker';
import { PlanningLayout } from '@/components/templates/planning-layout';
import { ManualAddLanding } from '@/components/templates/manual-add-landing';
import { ManualAddEntityForm } from '@/components/templates/manual-add-entity-form';
import { useWorkspace } from '@/hooks/use-workspace';
import { isManufacturingWorkspace } from '@/types/workspace';

const MANUAL_ENTITIES = [
  'companies',
  'products',
  'fields',
  'production-units',
  'business-partners',
] as const;
type ManualEntity = (typeof MANUAL_ENTITIES)[number];

/** Agronomic manual entities — hidden/blocked in manufacturing workspaces. */
const AGRONOMIC_MANUAL_ENTITIES: ReadonlySet<ManualEntity> = new Set([
  'fields',
  'production-units',
]);

interface AddDataSearch {
  readonly type?: 'file' | 'plan' | 'manual';
  readonly mode?: 'manual' | 'auto';
  readonly entity?: ManualEntity;
  readonly extractionIds?: string;
  readonly prefillCompanyId?: string;
}

function isManualEntity(value: unknown): value is ManualEntity {
  return typeof value === 'string' && (MANUAL_ENTITIES as readonly string[]).includes(value);
}

function parseExtractionIdsParam(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export const Route = createFileRoute('/_dashboard/add-data')({
  component: AddDataPage,
  validateSearch: (search: Record<string, unknown>): AddDataSearch => ({
    type:
      search.type === 'file' || search.type === 'plan' || search.type === 'manual'
        ? search.type
        : undefined,
    mode: search.mode === 'manual' || search.mode === 'auto' ? search.mode : undefined,
    entity: isManualEntity(search.entity) ? search.entity : undefined,
    extractionIds: parseExtractionIdsParam(search.extractionIds),
    prefillCompanyId:
      typeof search.prefillCompanyId === 'string' && search.prefillCompanyId.trim().length > 0
        ? search.prefillCompanyId.trim()
        : undefined,
  }),
});

// eslint-disable-next-line react-refresh/only-export-components -- route file keeps its page component inline
function AddDataPage() {
  const { type, mode, entity, extractionIds, prefillCompanyId } = Route.useSearch();
  const { activeWorkspaceKind } = useWorkspace();
  const isManufacturing = isManufacturingWorkspace(activeWorkspaceKind);

  // Manufacturing workspaces have no agronomic surfaces: block deep-links to the
  // dosage planner and to field/production-unit forms.
  if (isManufacturing && type === 'plan') {
    return <Navigate to="/add-data" search={{}} replace />;
  }
  if (isManufacturing && type === 'manual' && entity && AGRONOMIC_MANUAL_ENTITIES.has(entity)) {
    return <Navigate to="/add-data" search={{ type: 'manual' }} replace />;
  }

  if (type === 'file') return <NewFilesLayout />;

  if (type === 'plan') {
    if (!mode) return <PlanModePicker />;
    return <PlanningLayout mode={mode} />;
  }

  if (type === 'manual') {
    if (!entity) return <ManualAddLanding />;
    const extractionIdList = extractionIds ? splitExtractionIds(extractionIds) : undefined;
    return (
      <ManualAddEntityForm
        entity={entity}
        extractionIds={extractionIdList}
        prefillCompanyId={prefillCompanyId}
      />
    );
  }

  return <AddDataLanding />;
}

function splitExtractionIds(csv: string): readonly string[] | undefined {
  const items = csv
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return items.length > 0 ? items : undefined;
}
