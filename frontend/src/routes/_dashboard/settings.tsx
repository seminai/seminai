import { createFileRoute } from '@tanstack/react-router';
import { SettingsPage } from '@/components/organisms/settings-page';
import type { SettingsSection } from '@/components/organisms/settings-page';

interface SettingsSearch {
  readonly section?: SettingsSection;
  readonly ruleId?: string;
}

const VALID_SECTIONS = new Set<string>([
  'user',
  'users',
  'costs',
  'integrations',
  'workspace',
  'rules',
  'plan',
]);

export const Route = createFileRoute('/_dashboard/settings')({
  component: SettingsRoute,
  validateSearch: (search: Record<string, unknown>): SettingsSearch => ({
    section:
      typeof search.section === 'string' && VALID_SECTIONS.has(search.section)
        ? (search.section as SettingsSection)
        : undefined,
    ruleId: typeof search.ruleId === 'string' ? search.ruleId : undefined,
  }),
});

function SettingsRoute() {
  const { section, ruleId } = Route.useSearch();
  return <SettingsPage initialSection={section} ruleId={ruleId} />;
}
