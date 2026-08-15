import { apiClient } from '@/api/client';

export interface AIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  createdAt?: string;
  toolCalls?: Array<{ tool: string; input?: Record<string, unknown> }>;
  toolResults?: Array<Record<string, unknown>>;
}

export interface AIConversation {
  id: string;
  title: string;
  updatedAt?: string;
  createdAt?: string;
  messages?: AIMessage[];
}

export interface AIConversationSummary {
  id: string;
  title: string;
  updatedAt?: string;
  createdAt?: string;
}

export interface QuickPrompt {
  id: string;
  label: string;
  prompt: string;
  category?: string;
}

export interface AIChatResponse {
  conversationId: string;
  message: AIMessage;
}

export async function listConversations(page = 1, limit = 30): Promise<{ items: AIConversationSummary[]; meta?: { page: number; limit: number; total: number } }> {
  return apiClient.get(`/api/v1/ai/conversations?page=${page}&limit=${limit}`);
}

export async function getConversation(id: string): Promise<AIConversation> {
  return apiClient.get(`/api/v1/ai/conversations/${id}`);
}

export async function createConversation(initialMessage?: string): Promise<AIConversation> {
  return apiClient.post('/api/v1/ai/conversations', { initialMessage });
}

export async function deleteConversation(id: string): Promise<{ deleted?: boolean }> {
  return apiClient.delete(`/api/v1/ai/conversations/${id}`);
}

export async function renameConversation(id: string, title: string): Promise<AIConversation> {
  return apiClient.patch(`/api/v1/ai/conversations/${id}`, { title });
}

export async function sendMessage(input: { conversationId?: string; message: string }): Promise<AIChatResponse> {
  return apiClient.post('/api/v1/ai/chat', input);
}

export async function getQuickPrompts(): Promise<{ items: QuickPrompt[] }> {
  return apiClient.get('/api/v1/ai/quick-prompts');
}

export interface McpManifest {
  name: string;
  version: string;
  description: string;
  transport: string[];
  tools: string[];
  collections: string[];
  limits: { maxLimit: number; maxPipelineStages: number; maxAggregationResults: number };
  blockedOperators: string[];
  blockedStages: string[];
}

export async function getMcpManifest(): Promise<McpManifest> {
  return apiClient.get('/api/v1/mcp/manifest');
}

export async function getMcpStatus(): Promise<{ ok: boolean; version?: string; readOnly: boolean; scopedBy: string }> {
  return apiClient.get('/api/v1/mcp/status');
}

export async function mcpFind(payload: {
  collection: string;
  filter?: Record<string, unknown>;
  projection?: Record<string, unknown>;
  sort?: Array<Record<string, number>>;
  limit?: number;
}): Promise<unknown[]> {
  return apiClient.post('/api/v1/mcp/find', payload);
}

export async function mcpAggregate(payload: {
  collection: string;
  pipeline: Array<Record<string, unknown>>;
  limit?: number;
}): Promise<unknown[]> {
  return apiClient.post('/api/v1/mcp/aggregate', payload);
}

export async function mcpCount(payload: { collection: string; filter?: Record<string, unknown> }): Promise<{ count: number }> {
  return apiClient.post('/api/v1/mcp/count', payload);
}