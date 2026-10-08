import { createFileRoute } from '@tanstack/react-router';
import { McpConnectPage } from '@/components/organisms/mcp-connect-page';
export const Route = createFileRoute('/mcp-connect')({
  validateSearch: (search: Record<string, unknown>) => ({
    pairing: typeof search.pairing === 'string' ? search.pairing : '',
  }),
  component: McpConnectRoute,
});

function McpConnectRoute() {
  return <McpConnectPage pairing={Route.useSearch().pairing} />;
}
