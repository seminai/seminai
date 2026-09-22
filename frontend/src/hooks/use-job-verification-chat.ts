import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { customFetch } from '@/lib/api-client';
import type { ApiSuccessResponse, DosageChatDetail, DosageChatListItem } from '@/types/dosage-chat';

const JOB_VERIFICATION_AGENT_CATEGORY = 'JOB_VERIFICATION_AGENT';

function fetchJobVerificationChats() {
  return customFetch<ApiSuccessResponse<readonly DosageChatListItem[]>>({
    url: '/chats',
    method: 'GET',
    params: { category: JOB_VERIFICATION_AGENT_CATEGORY },
  });
}

function fetchJobVerificationChatDetail(chatId: string) {
  return customFetch<ApiSuccessResponse<DosageChatDetail>>({
    url: `/chats/${chatId}`,
    method: 'GET',
  });
}

export function useJobVerificationChatsQuery() {
  return useQuery({
    queryKey: ['chats', { category: JOB_VERIFICATION_AGENT_CATEGORY }],
    queryFn: fetchJobVerificationChats,
    staleTime: 60_000,
  });
}

export function useJobVerificationChatDetailQuery(chatId: string | null) {
  return useQuery({
    queryKey: ['chat', chatId],
    queryFn: () => fetchJobVerificationChatDetail(chatId ?? ''),
    enabled: Boolean(chatId),
    staleTime: 60_000,
  });
}

export function useDeleteJobVerificationChatMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (chatId: string) =>
      customFetch<ApiSuccessResponse<{ readonly deleted: true }>>({
        url: `/chats/${chatId}`,
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['chats', { category: JOB_VERIFICATION_AGENT_CATEGORY }],
      });
    },
  });
}
