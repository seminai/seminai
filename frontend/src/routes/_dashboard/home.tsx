import { createFileRoute } from '@tanstack/react-router';
import { HomeView } from '@/components/organisms/home-view';

export const Route = createFileRoute('/_dashboard/home')({
  component: HomeView,
});
