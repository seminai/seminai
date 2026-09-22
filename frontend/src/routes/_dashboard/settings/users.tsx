import { createFileRoute, redirect } from '@tanstack/react-router';
import { SettingsUsersManagementSection } from '@/components/organisms/settings-users-management-section';
import { ensureAuthLoaded } from '@/hooks/use-auth';

export const Route = createFileRoute('/_dashboard/settings/users')({
  beforeLoad: async ({ context }) => {
    const user = await ensureAuthLoaded(context.queryClient);
    if (!user) {
      throw redirect({ to: '/login' });
    }
    if (user.role !== 'ADMIN' && user.role !== 'GOD') {
      throw redirect({ to: '/home' });
    }
  },
  component: SettingsUsersPageRoute,
});

function SettingsUsersPageRoute() {
  return (
    <main className="flex h-full min-h-0 flex-1 overflow-hidden p-4 md:p-6">
      <section className="flex w-full min-w-0 overflow-hidden rounded-xl border bg-background">
        <div className="min-w-0 flex-1 overflow-auto">
          <SettingsUsersManagementSection />
        </div>
      </section>
    </main>
  );
}
