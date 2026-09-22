import { useEffect, useCallback } from 'react';
import {
  useQuery,
  useMutation,
  useQueryClient,
  queryOptions,
  type QueryClient,
} from '@tanstack/react-query';
import { customFetch } from '@/lib/api-client';
import { resetAnalytics } from '@/lib/analytics';
import type {
  AuthUser,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
} from '@/types/auth';

const AUTH_QUERY_KEY = ['auth', 'me'] as const;

export const authQueryOptions = queryOptions({
  queryKey: AUTH_QUERY_KEY,
  queryFn: () => customFetch<AuthUser>({ url: '/auth/me', method: 'GET' }),
  retry: false,
  staleTime: 5 * 60 * 1000,
});

export async function ensureAuthLoaded(queryClient: QueryClient): Promise<AuthUser | null> {
  const state = queryClient.getQueryState(authQueryOptions.queryKey);
  if (state?.dataUpdatedAt && state.dataUpdatedAt > 0) {
    return queryClient.getQueryData(authQueryOptions.queryKey) ?? null;
  }

  try {
    return await queryClient.fetchQuery(authQueryOptions);
  } catch {
    queryClient.setQueryData(authQueryOptions.queryKey, null as unknown as AuthUser);
    return null;
  }
}

export function useAuth() {
  const queryClient = useQueryClient();

  const {
    data: user,
    isLoading,
    isError,
  } = useQuery(authQueryOptions);

  const loginMutation = useMutation({
    mutationFn: (credentials: LoginRequest) =>
      customFetch<LoginResponse>({ url: '/auth/login', method: 'POST', data: credentials }),
    onSuccess: (result) => {
      queryClient.setQueryData(AUTH_QUERY_KEY, result.data.user);
    },
  });

  const registerMutation = useMutation({
    mutationFn: (data: RegisterRequest) =>
      customFetch<RegisterResponse>({ url: '/auth/register', method: 'POST', data }),
  });

  const logoutMutation = useMutation({
    mutationFn: () => customFetch<void>({ url: '/auth/logout', method: 'POST' }),
    onSuccess: () => {
      resetAnalytics();
      queryClient.setQueryData(AUTH_QUERY_KEY, null);
      queryClient.clear();
    },
  });

  const handleUnauthorized = useCallback(() => {
    queryClient.setQueryData(AUTH_QUERY_KEY, null);
    queryClient.cancelQueries({
      predicate: (query) => query.queryKey[0] !== 'auth',
    });
    window.location.href = '/login';
  }, [queryClient]);

  useEffect(() => {
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, [handleUnauthorized]);

  return {
    user: user ?? null,
    isLoading,
    isAuthenticated: !!user && !isError,
    login: loginMutation,
    register: registerMutation,
    logout: logoutMutation,
  } as const;
}
