import { createFileRoute } from '@tanstack/react-router';
import { FarmWorkspace } from '@/components/organisms/farm/farm-workspace';
export const Route = createFileRoute('/_dashboard/quaderno')({ component: FarmWorkspace });
