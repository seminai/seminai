import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@/lib/api-client";
import type {
  ApiSuccessResponse,
  DosageChatDetail,
  DosageChatListItem,
} from "@/types/dosage-chat";

const DOSAGE_AGENT_CATEGORY = "DOSAGE_AGENT";

function fetchDosageChats() {
  return customFetch<ApiSuccessResponse<readonly DosageChatListItem[]>>({
    url: "/chats",
    method: "GET",
    params: { category: DOSAGE_AGENT_CATEGORY },
  });
}

function fetchDosageChatDetail(chatId: string) {
  return customFetch<ApiSuccessResponse<DosageChatDetail>>({
    url: `/chats/${chatId}`,
    method: "GET",
  });
}

export function useDosageChatsQuery() {
  return useQuery({
    queryKey: ["chats", { category: DOSAGE_AGENT_CATEGORY }],
    queryFn: fetchDosageChats,
    staleTime: 60_000,
  });
}

export function useDosageChatDetailQuery(chatId: string | null) {
  return useQuery({
    queryKey: ["chat", chatId],
    queryFn: () => fetchDosageChatDetail(chatId ?? ""),
    enabled: Boolean(chatId),
    staleTime: 60_000,
  });
}

export function useDeleteDosageChatMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (chatId: string) =>
      customFetch<ApiSuccessResponse<{ readonly deleted: true }>>({
        url: `/chats/${chatId}`,
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["chats", { category: DOSAGE_AGENT_CATEGORY }],
      });
    },
  });
}
