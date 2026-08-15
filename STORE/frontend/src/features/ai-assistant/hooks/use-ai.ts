import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createConversation,
  deleteConversation,
  getConversation,
  getMcpManifest,
  getMcpStatus,
  getQuickPrompts,
  listConversations,
  renameConversation,
  sendMessage,
  type AIConversation,
  type AIConversationSummary,
  type QuickPrompt,
} from '@/api/endpoints/ai';

export const aiKeys = {
  all: ['ai'] as const,
  conversations: () => [...aiKeys.all, 'conversations'] as const,
  conversation: (id: string) => [...aiKeys.all, 'conversation', id] as const,
  quickPrompts: () => [...aiKeys.all, 'quickPrompts'] as const,
  mcpManifest: () => [...aiKeys.all, 'mcp-manifest'] as const,
  mcpStatus: () => [...aiKeys.all, 'mcp-status'] as const,
};

export function useConversations() {
  return useQuery<{ items: AIConversationSummary[]; meta?: { page: number; limit: number; total: number } }>({
    queryKey: aiKeys.conversations(),
    queryFn: () => listConversations(),
    staleTime: 30_000,
  });
}

export function useConversation(id: string | null) {
  return useQuery<AIConversation>({
    queryKey: id ? aiKeys.conversation(id) : aiKeys.conversation('none'),
    queryFn: () => getConversation(id as string),
    enabled: Boolean(id),
    staleTime: 5_000,
  });
}

export function useQuickPrompts() {
  return useQuery<{ items: QuickPrompt[] }>({
    queryKey: aiKeys.quickPrompts(),
    queryFn: getQuickPrompts,
    staleTime: 60 * 60_000,
  });
}

export function useCreateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (initialMessage?: string) => createConversation(initialMessage),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: aiKeys.conversations() });
    },
  });
}

export function useDeleteConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteConversation(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: aiKeys.conversations() });
    },
  });
}

export function useRenameConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => renameConversation(id, title),
    onSuccess: (conversation) => {
      qc.invalidateQueries({ queryKey: aiKeys.conversations() });
      if (conversation?.id) {
        qc.setQueryData(aiKeys.conversation(conversation.id), conversation);
        qc.invalidateQueries({ queryKey: aiKeys.conversation(conversation.id) });
      }
    },
  });
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { conversationId?: string; message: string }) => sendMessage(input),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: aiKeys.conversations() });
      if (data.conversationId) {
        qc.invalidateQueries({ queryKey: aiKeys.conversation(data.conversationId) });
      }
    },
  });
}

export function useMcpManifest() {
  return useQuery({
    queryKey: aiKeys.mcpManifest(),
    queryFn: getMcpManifest,
    staleTime: 60 * 60_000,
  });
}

export function useMcpStatus() {
  return useQuery({
    queryKey: aiKeys.mcpStatus(),
    queryFn: getMcpStatus,
    refetchInterval: 30_000,
  });
}