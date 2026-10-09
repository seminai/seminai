import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { useCompanies } from '@/hooks/use-company-options';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { farmRequest } from '@/services/farm-api';
export function McpConnectPage({ pairing }: { pairing: string }) {
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  return (
    <main className="mx-auto max-w-lg space-y-6 p-6 py-16">
      <h1 className="text-2xl font-semibold">Collega il tuo assistente</h1>
      <p>
        Seminai concede accesso a un’azienda. Ogni operazione proposta deve essere confermata nel
        quaderno.
      </p>
      {auth.isLoading ? (
        <p role="status">Caricamento…</p>
      ) : auth.user ? (
        <PairingApproval pairing={pairing} />
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            auth.login.mutate({ email, password });
          }}
        >
          <label className="block">
            Email
            <Input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="block">
            Password
            <Input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <Button disabled={auth.login.isPending}>Accedi a Seminai</Button>
          {auth.login.error && <p role="alert">{auth.login.error.message}</p>}
        </form>
      )}
    </main>
  );
}
function PairingApproval({ pairing }: { pairing: string }) {
  const { companies } = useCompanies();
  const [company, setCompany] = useState('');
  const companyId = company || companies[0]?.id || '';
  const query = useQuery({
    queryKey: ['mcp-pairing', pairing],
    queryFn: () =>
      farmRequest<{ name: string; expiresAt: string; approvedAt: string | null }>(
        `/farm/pairings/${encodeURIComponent(pairing)}`,
      ),
    enabled: Boolean(pairing),
  });
  const approve = useMutation({
    mutationFn: () =>
      farmRequest(`/farm/pairings/${encodeURIComponent(pairing)}/approve`, 'POST', { companyId }),
  });
  if (approve.isSuccess || query.data?.approvedAt)
    return (
      <p role="status" className="rounded-lg border p-4">
        Collegamento autorizzato. Torna all’assistente. Puoi revocare l’accesso nelle integrazioni.
      </p>
    );
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{query.data?.name || 'Richiesta di collegamento'}</h2>
      <label className="block space-y-2">
        Azienda
        <select
          value={companyId}
          className="h-10 w-full rounded-md border bg-background px-3"
          onChange={(event) => setCompany(event.target.value)}
        >
          {companies.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <p className="text-sm text-muted-foreground">
        Autorizza solo se hai appena richiesto questo collegamento dal tuo assistente. Permessi:
        lettura e proposta. Nessun permesso di approvazione.
      </p>
      <Button
        disabled={
          !query.data ||
          !companyId ||
          approve.isPending ||
          new Date(query.data.expiresAt) <= new Date()
        }
        onClick={() => approve.mutate()}
      >
        Autorizza collegamento
      </Button>
      {(query.error || approve.error) && (
        <p role="alert">{(query.error || approve.error)?.message}</p>
      )}
    </div>
  );
}
