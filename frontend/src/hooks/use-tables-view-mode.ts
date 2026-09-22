import { useCallback, useMemo } from 'react';
import {
  useUpdateUserSettings,
  useUserSettings,
  type TablesViewMode,
} from '@/hooks/use-user-settings';

function toTablesViewMode(value: unknown): TablesViewMode {
  return value === 'excel' ? 'excel' : 'grid';
}

export interface UseTablesViewModeResult {
  readonly mode: TablesViewMode;
  readonly setMode: (mode: TablesViewMode) => void;
  readonly isLoading: boolean;
  readonly isUpdating: boolean;
}

/**
 * Read and update the user's preferred tables rendering mode.
 *
 * Returns `grid` while the preference is loading or when settings are missing,
 * so the UI never flashes the Excel view for users who did not opt-in.
 * Mutation updates the settings detail cache optimistically to avoid refetches.
 */
export function useTablesViewMode(): UseTablesViewModeResult {
  const settingsQuery = useUserSettings();
  const updateSettings = useUpdateUserSettings();
  const mode = toTablesViewMode(settingsQuery.data?.tablesViewMode);

  const setMode = useCallback(
    (nextMode: TablesViewMode) => {
      updateSettings.mutate({ tablesViewMode: nextMode });
    },
    [updateSettings],
  );

  return useMemo(
    () => ({
      mode,
      setMode,
      isLoading: settingsQuery.isLoading,
      isUpdating: updateSettings.isPending,
    }),
    [mode, setMode, settingsQuery.isLoading, updateSettings.isPending],
  );
}
