import { lazy, Suspense, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Building2, CircleDollarSign, CreditCard, FileText, PlugZap, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SettingsUserSection } from '@/components/organisms/settings-user-section';
import { SettingsIntegrationsSection } from '@/components/organisms/settings-integrations-section';
const SettingsCostsSection = lazy(() => import('@/components/organisms/settings-costs-section').then((m) => ({ default: m.SettingsCostsSection })));
import { SettingsWorkspaceSection } from '@/components/organisms/settings-workspace-section';
import { SettingsRulesSection } from '@/components/organisms/settings-rules-section';
import { SettingsPlanSection } from '@/components/organisms/settings-plan-section';
import { useAuth } from '@/hooks/use-auth';

export type SettingsSection = 'user' | 'users' | 'costs' | 'integrations' | 'workspace' | 'rules' | 'plan';

const sections: ReadonlyArray<{
  readonly id: SettingsSection;
  readonly labelKey: string;
  readonly icon: typeof User;
  readonly group: 'account' | 'workspace';
}> = [
  { id: 'user', labelKey: 'settings.sections.user', icon: User, group: 'account' },
  { id: 'users', labelKey: 'settings.sections.users', icon: User, group: 'account' },
  { id: 'costs', labelKey: 'settings.sections.costs', icon: CircleDollarSign, group: 'account' },
  { id: 'integrations', labelKey: 'settings.sections.integrations', icon: PlugZap, group: 'account' },
  { id: 'workspace', labelKey: 'common.workspace', icon: Building2, group: 'workspace' },
  { id: 'rules', labelKey: 'settings.sections.rules', icon: FileText, group: 'workspace' },
  { id: 'plan', labelKey: 'settings.sections.plan', icon: CreditCard, group: 'workspace' },
] as const;

interface SettingsPageProps {
  readonly initialSection?: SettingsSection;
  readonly ruleId?: string;
}

export function SettingsPage({ initialSection, ruleId }: SettingsPageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState<SettingsSection>(initialSection ?? 'user');
  const canManageUsers = user?.role === 'ADMIN' || user?.role === 'GOD';

  const accountSections = sections.filter((section) =>
    section.id === 'users' ? canManageUsers : section.group === 'account',
  );
  const workspaceSections = sections.filter((s) => s.group === 'workspace');

  const handleSelectSection = (section: SettingsSection) => {
    if (section === 'users') {
      void navigate({ to: '/settings/users' });
      return;
    }
    setActiveSection(section);
  };

  return (
    <main className="flex h-full min-h-0 flex-1 overflow-hidden p-4 md:p-6">
      <section className="flex w-full min-w-0 overflow-hidden rounded-xl border bg-background">
        <aside className="w-60 shrink-0 border-r">
          <div className="border-b px-4 py-3">
            <h1 className="text-sm font-semibold">{t('common.settings')}</h1>
          </div>
          <nav className="flex flex-col gap-1 p-2">
            <SectionGroup label={t('settings.groups.account')} items={accountSections} activeId={activeSection} onSelect={handleSelectSection} />
            <SectionGroup label={t('common.workspace')} items={workspaceSections} activeId={activeSection} onSelect={setActiveSection} />
          </nav>
        </aside>

        <div className="min-w-0 flex-1 overflow-auto">
          {activeSection === 'user' && <SettingsUserSection />}
          {activeSection === 'costs' && <Suspense fallback={null}><SettingsCostsSection /></Suspense>}
          {activeSection === 'integrations' && <SettingsIntegrationsSection />}
          {activeSection === 'workspace' && <SettingsWorkspaceSection />}
          {activeSection === 'rules' && <SettingsRulesSection ruleId={ruleId} />}
          {activeSection === 'plan' && <SettingsPlanSection />}
        </div>
      </section>
    </main>
  );
}

function SectionGroup({
  label,
  items,
  activeId,
  onSelect,
}: {
  readonly label: string;
  readonly items: ReadonlyArray<{ readonly id: SettingsSection; readonly labelKey: string; readonly icon: typeof User }>;
  readonly activeId: SettingsSection;
  readonly onSelect: (id: SettingsSection) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <p className="mt-3 mb-1 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground first:mt-0">
        {label}
      </p>
      {items.map((section) => {
        const Icon = section.icon;
        const isActive = activeId === section.id;
        return (
          <button
            key={section.id}
            type="button"
            onClick={() => onSelect(section.id)}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors',
              isActive
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {t(section.labelKey)}
          </button>
        );
      })}
    </>
  );
}
