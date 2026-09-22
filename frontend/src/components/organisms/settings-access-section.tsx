import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { fetchAccessStatus, rotateAccessInvite } from '@/lib/access-api';
import { Button } from '@/components/ui/button';

export function SettingsAccessSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const statusQuery = useQuery({ queryKey: ['access-status'], queryFn: fetchAccessStatus });
  const rotateMutation = useMutation({
    mutationFn: rotateAccessInvite,
    onSuccess: (data) => {
      queryClient.setQueryData(['access-status'], data);
    },
  });
  const status = statusQuery.data;

  return (
    <section className="space-y-4 p-6">
      <h2 className="text-lg font-semibold">{t('settings.sections.access')}</h2>
      {statusQuery.isError ? <p>{t('settings.access.loadError')}</p> : null}
      {status ? (
        <dl className="grid gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">{t('settings.access.mode')}</dt>
            <dd>{status.accessMode}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('settings.access.publicUrl')}</dt>
            <dd className="break-all">{status.publicBaseUrl}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('settings.access.tunnel')}</dt>
            <dd>
              {status.tunnel.provider} ({status.tunnel.healthy ? t('settings.access.healthy') : t('settings.access.unhealthy')})
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('settings.access.inviteUrl')}</dt>
            <dd className="break-all">{status.inviteUrl}</dd>
          </div>
          <img alt={t('settings.access.qrAlt')} className="h-40 w-40 border" src={status.qrDataUrl} />
        </dl>
      ) : null}
      <Button type="button" onClick={() => rotateMutation.mutate()} disabled={rotateMutation.isPending}>
        {t('settings.access.rotate')}
      </Button>
    </section>
  );
}
