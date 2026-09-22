import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { customFetch, ApiError } from '@/lib/api-client';
import { normalizeLanguage, type AppLanguage } from '@/i18n/languages';

export type TablesViewMode = 'grid' | 'excel';

export interface UserSettings {
  readonly id: string;
  readonly userId: string;
  readonly language: string;
  readonly tablesViewMode?: string;
}

interface SettingsEnvelope {
  readonly data?: {
    readonly settings?: UserSettings;
    readonly data?: {
      readonly settings?: UserSettings;
    };
  };
}

interface UpdateUserSettingsInput {
  readonly language?: AppLanguage;
  readonly tablesViewMode?: TablesViewMode;
}

export const USER_SETTINGS_QUERY_KEY = ['settings', 'me'] as const;

function extractSettings(response: SettingsEnvelope): UserSettings | null {
  return response.data?.settings ?? response.data?.data?.settings ?? null;
}

async function fetchUserSettings(): Promise<UserSettings | null> {
  try {
    const response = await customFetch<SettingsEnvelope>({
      url: '/settings/me',
      method: 'GET',
    });
    return extractSettings(response);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

async function createUserSettings(input: UpdateUserSettingsInput): Promise<UserSettings> {
  const response = await customFetch<SettingsEnvelope>({
    url: '/settings',
    method: 'POST',
    data: {
      language: input.language ?? 'it',
      tablesViewMode: input.tablesViewMode,
    },
  });
  const settings = extractSettings(response);
  if (!settings) throw new Error('Settings response missing settings');
  return settings;
}

async function updateUserSettings(id: string, input: UpdateUserSettingsInput): Promise<UserSettings> {
  const response = await customFetch<SettingsEnvelope>({
    url: `/settings/${id}`,
    method: 'PUT',
    data: input,
  });
  const settings = extractSettings(response);
  if (!settings) throw new Error('Settings response missing settings');
  return settings;
}

export function useUserSettings() {
  return useQuery({
    queryKey: USER_SETTINGS_QUERY_KEY,
    queryFn: fetchUserSettings,
    staleTime: 60_000,
  });
}

export function useUpdateUserSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateUserSettingsInput) => {
      const cachedSettings = queryClient.getQueryData<UserSettings | null>(USER_SETTINGS_QUERY_KEY);
      const settings = cachedSettings === undefined ? await fetchUserSettings() : cachedSettings;
      const normalizedInput = input.language
        ? { ...input, language: normalizeLanguage(input.language) }
        : input;
      return settings?.id
        ? updateUserSettings(settings.id, normalizedInput)
        : createUserSettings(normalizedInput);
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(USER_SETTINGS_QUERY_KEY, settings);
    },
  });
}
