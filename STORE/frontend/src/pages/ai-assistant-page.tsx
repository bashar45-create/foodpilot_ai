import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  Bot,
  ChevronDown,
  ChevronUp,
  Database,
  History as HistoryIcon,
  Loader2,
  MessageSquarePlus,
  Minimize2,
  Maximize2,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ApiException } from '@/types/api';
import { usePersistedBoolean } from '@/hooks/use-persisted-boolean';
import {
  useConversation,
  useConversations,
  useDeleteConversation,
  useMcpManifest,
  useMcpStatus,
  useQuickPrompts,
  useRenameConversation,
  useSendMessage,
} from '@/features/ai-assistant/hooks/use-ai';
import { mcpAggregate, mcpCount, mcpFind } from '@/api/endpoints/ai';
import type { AIConversationSummary, AIMessage } from '@/api/endpoints/ai';

type Tab = 'chat' | 'mcp';

interface PendingMessage {
  /** Synthetic id so React keys stay stable. */
  id: string;
  /** The user's prompt as it was sent. */
  text: string;
  /** Tools the agent has called so far while answering this prompt. */
  tools: Array<{ tool: string; input?: Record<string, unknown> }>;
}

const PENDING_SENTINEL_ID = '__pending__';

export function AiAssistantPage(): JSX.Element {
  const [tab, setTab] = useState<Tab>('chat');
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState('');
  // Optimistic state for the prompt we just sent — keeps the UI smooth while the
  // backend streams back the answer.
  const [pending, setPending] = useState<PendingMessage | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const conversationsQuery = useConversations();
  const conversationQuery = useConversation(activeConversationId);
  const quickPromptsQuery = useQuickPrompts();
  const sendMutation = useSendMessage();
  const deleteMutation = useDeleteConversation();
  const renameMutation = useRenameConversation();

  const conversationItems = conversationsQuery.data?.items ?? [];
  const persistedMessages: AIMessage[] = useMemo(
    () => conversationQuery.data?.messages ?? [],
    [conversationQuery.data],
  );

  // Compose what the chat panel should render:
  //  - the persisted assistant/user messages from the DB
  //  - the optimistic user bubble for the prompt we just sent
  //  - the "thinking" placeholder while we wait for the answer
  const optimisticUserMessage: AIMessage | null = pending
    ? {
        id: `${PENDING_SENTINEL_ID}-user`,
        role: 'user',
        content: pending.text,
        createdAt: new Date().toISOString(),
      }
    : null;
  const messages: AIMessage[] = optimisticUserMessage
    ? [...persistedMessages, optimisticUserMessage]
    : persistedMessages;

  const isSending = sendMutation.isPending;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isSending, pending?.tools.length]);

  const startNewConversation = useCallback((): void => {
    setActiveConversationId(null);
    setDraft('');
    setError(null);
    setRenamingId(null);
    setPending(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const pickConversation = useCallback((item: AIConversationSummary): void => {
    setActiveConversationId(item.id);
    setError(null);
    setRenamingId(null);
    setPending(null);
  }, []);

  const beginRename = useCallback((item: AIConversationSummary): void => {
    setRenamingId(item.id);
    setRenamingValue(item.title);
  }, []);

  async function commitRename(item: AIConversationSummary): Promise<void> {
    const next = renamingValue.trim();
    if (!next || next === item.title) {
      setRenamingId(null);
      return;
    }
    try {
      await renameMutation.mutateAsync({ id: item.id, title: next });
    } catch (err) {
      const message = err instanceof ApiException ? err.message : 'Rename failed';
      setError(message);
    } finally {
      setRenamingId(null);
    }
  }

  async function handleSend(text?: string): Promise<void> {
    const message = (text ?? draft).trim();
    if (!message) return;
    setError(null);
    setDraft('');
    // Show the user's bubble immediately so the chat feels responsive even
    // before the first byte comes back from the agent.
    setPending({ id: PENDING_SENTINEL_ID, text: message, tools: [] });
    try {
      const response = await sendMutation.mutateAsync({
        conversationId: activeConversationId ?? undefined,
        message,
      });
      // Switch to the persisted conversation and clear the pending placeholder.
      setActiveConversationId(response.conversationId);
      setPending(null);
    } catch (err) {
      const message = err instanceof ApiException ? err.message : 'Failed to reach the assistant';
      setError(message);
      setDraft(message);
      setPending(null);
    }
  }

  async function handleDelete(item: AIConversationSummary): Promise<void> {
    if (!confirm(`Delete "${item.title}"?`)) return;
    try {
      await deleteMutation.mutateAsync(item.id);
      if (activeConversationId === item.id) startNewConversation();
    } catch (err) {
      const message = err instanceof ApiException ? err.message : 'Could not delete conversation';
      setError(message);
    }
  }

  const titleForActive =
    activeConversationId == null
      ? 'New conversation'
      : conversationItems.find((c) => c.id === activeConversationId)?.title ??
        conversationQuery.data?.title ??
        'Conversation';

  const showEmpty = !pending && messages.length === 0 && !isSending && !isLoadingHistory();

  function isLoadingHistory(): boolean {
    return Boolean(activeConversationId) && conversationQuery.isFetching && persistedMessages.length === 0;
  }

  return (
    <div className="grid h-[calc(100vh-160px)] grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <Card className="flex h-full flex-col gap-3 overflow-hidden p-4">
        <Button onClick={startNewConversation} className="w-full">
          <MessageSquarePlus className="mr-2 h-4 w-4" /> New chat
        </Button>

        <div className="flex items-center gap-2 rounded-2xl bg-zinc-100 p-1 text-xs">
          <TabButton active={tab === 'chat'} onClick={() => setTab('chat')} icon={<HistoryIcon className="h-3.5 w-3.5" />} label="Chat history" />
          <TabButton active={tab === 'mcp'} onClick={() => setTab('mcp')} icon={<Database className="h-3.5 w-3.5" />} label="Data tools" />
        </div>

        {tab === 'chat' ? (
          <ChatHistory
            items={conversationItems}
            activeId={activeConversationId}
            isLoading={conversationsQuery.isLoading}
            isError={conversationsQuery.isError}
            error={conversationsQuery.error as Error | null}
            renamingId={renamingId}
            renamingValue={renamingValue}
            onRenameValueChange={setRenamingValue}
            onPick={pickConversation}
            onBeginRename={beginRename}
            onCommitRename={commitRename}
            onCancelRename={() => setRenamingId(null)}
            onDelete={handleDelete}
            onRetry={() => void conversationsQuery.refetch()}
          />
        ) : (
          <DataToolsRail />
        )}
      </Card>

      <Card className="flex h-full flex-col overflow-hidden p-0">
        {tab === 'chat' ? (
          <ChatPanel
            title={titleForActive}
            messages={messages}
            isLoadingHistory={isLoadingHistory()}
            quickPrompts={quickPromptsQuery.data?.items ?? []}
            isSending={isSending}
            pendingTools={pending?.tools ?? []}
            error={error}
            draft={draft}
            onDraftChange={setDraft}
            onSend={() => void handleSend()}
            onQuickPrompt={(text) => void handleSend(text)}
            inputRef={inputRef}
            messagesEndRef={messagesEndRef}
          />
        ) : (
          <DataToolsPanel />
        )}
      </Card>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Sub-components
// -----------------------------------------------------------------------------

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 font-semibold transition',
        active ? 'bg-white text-zinc-950 shadow-soft' : 'text-zinc-500 hover:text-zinc-700',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

interface ChatHistoryProps {
  items: AIConversationSummary[];
  activeId: string | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  renamingId: string | null;
  renamingValue: string;
  onRenameValueChange: (value: string) => void;
  onPick: (item: AIConversationSummary) => void;
  onBeginRename: (item: AIConversationSummary) => void;
  onCommitRename: (item: AIConversationSummary) => Promise<void>;
  onCancelRename: () => void;
  onDelete: (item: AIConversationSummary) => Promise<void>;
  onRetry: () => void;
}

function ChatHistory({
  items,
  activeId,
  isLoading,
  isError,
  error,
  renamingId,
  renamingValue,
  onRenameValueChange,
  onPick,
  onBeginRename,
  onCommitRename,
  onCancelRename,
  onDelete,
  onRetry,
}: ChatHistoryProps): JSX.Element {
  return (
    <>
      <div className="flex items-center justify-between px-2 pt-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Chat history
        </p>
        {items.length > 0 ? (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-600">
            {items.length}
          </span>
        ) : null}
      </div>
      <div className="flex-1 overflow-auto pr-1">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-2 px-2 py-8 text-center text-sm">
            <Bot className="h-6 w-6 text-red-400" />
            <p className="font-semibold text-zinc-700">Could not load history</p>
            <p className="text-xs text-zinc-500">{error?.message ?? 'Unknown error'}</p>
            <Button variant="outline" onClick={onRetry} className="mt-2">
              <RefreshIcon /> Retry
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-2 py-8 text-center text-sm text-zinc-500">
            <Bot className="h-6 w-6 text-zinc-400" />
            <p>No conversations yet.</p>
            <p className="text-xs">Send a message to start your first chat.</p>
          </div>
        ) : (
          <ul className="space-y-1">
            {items.map((item) => {
              const isActive = activeId === item.id;
              const isRenaming = renamingId === item.id;
              return (
                <li key={item.id}>
                  <div
                    className={cn(
                      'group flex w-full items-start justify-between gap-2 rounded-2xl px-3 py-2 text-left text-sm transition',
                      isActive ? 'bg-zinc-950 text-white' : 'text-zinc-700 hover:bg-zinc-100',
                    )}
                  >
                    {isRenaming ? (
                      <input
                        autoFocus
                        value={renamingValue}
                        onChange={(e) => onRenameValueChange(e.target.value)}
                        onBlur={() => void onCommitRename(item)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void onCommitRename(item);
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            onCancelRename();
                          }
                        }}
                        className={cn(
                          'flex-1 rounded-md border bg-white px-2 py-1 text-xs text-zinc-950 focus:outline-none',
                          'border-zinc-300 focus:border-zinc-950',
                        )}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => onPick(item)}
                        className="flex-1 truncate text-left font-medium"
                        title={item.title}
                      >
                        {item.title}
                      </button>
                    )}
                    <div
                      className={cn(
                        'flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100',
                        isActive && 'opacity-100',
                      )}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onBeginRename(item);
                        }}
                        className={cn(
                          'rounded-full p-1 text-[10px] font-semibold uppercase tracking-wide',
                          isActive ? 'text-white/80 hover:bg-white/10 hover:text-white' : 'text-zinc-500 hover:bg-zinc-200',
                        )}
                        aria-label="Rename conversation"
                        title="Rename"
                      >
                        rename
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void onDelete(item);
                        }}
                        className={cn(
                          'rounded-full p-1',
                          isActive ? 'text-white/80 hover:bg-white/10 hover:text-white' : 'text-zinc-500 hover:bg-zinc-200',
                        )}
                        aria-label="Delete conversation"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

interface QuickPromptItem {
  id: string;
  label: string;
  prompt: string;
  category?: string;
}

interface ChatPanelProps {
  title: string;
  messages: AIMessage[];
  isLoadingHistory: boolean;
  quickPrompts: QuickPromptItem[];
  isSending: boolean;
  pendingTools: Array<{ tool: string; input?: Record<string, unknown> }>;
  error: string | null;
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onQuickPrompt: (prompt: string) => void;
  inputRef: React.MutableRefObject<HTMLTextAreaElement | null>;
  messagesEndRef: React.MutableRefObject<HTMLDivElement | null>;
}

function ChatPanel({
  title,
  messages,
  isLoadingHistory,
  quickPrompts,
  isSending,
  pendingTools,
  error,
  draft,
  onDraftChange,
  onSend,
  onQuickPrompt,
  inputRef,
  messagesEndRef,
}: ChatPanelProps): JSX.Element {
  // The empty state only shows when there's literally nothing in the chat — not
  // while the assistant is mid-flight. That keeps the user's place stable.
  const showEmpty = messages.length === 0 && !isLoadingHistory && !isSending;

  // Persisted collapse state for the in-flight "Frequent questions" strip.
  const [fqCollapsed, fqCtl] = usePersistedBoolean('ai.fq.collapsed', false);

  // The strip only renders the first 6 prompts, so the "hidden" badge should
  // reflect what's actually hidden from view (6), not the total available (13).
  const stripVisibleCount = Math.min(quickPrompts.length, 6);

  return (
    <>
      <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-zinc-950">{title}</h2>
          <p className="text-xs text-zinc-500">
            Grounded in your live store data — every number comes from a real tool call.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isSending ? (
            <Badge className="bg-amber-50 text-amber-700 border-amber-200">
              <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Thinking
            </Badge>
          ) : (
            <Badge>Read-only</Badge>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-zinc-50 px-6 py-6 transition-opacity">
        {showEmpty ? (
          <EmptyChat
            quickPrompts={quickPrompts}
            onQuickPrompt={onQuickPrompt}
            disabled={isSending}
          />
        ) : isLoadingHistory && messages.length === 0 ? (
          <div className="mx-auto flex max-w-3xl flex-col gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {isSending ? <ThinkingPlaceholder tools={pendingTools} /> : null}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="border-t border-zinc-200 bg-white px-6 py-4">
        <div className="mx-auto max-w-3xl">
          {!showEmpty && quickPrompts.length > 0 ? (
            <div className="mb-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={fqCtl.toggle}
                  className="flex flex-1 items-center gap-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-700"
                  aria-expanded={!fqCollapsed}
                  aria-controls="frequent-questions-strip"
                >
                  {fqCollapsed ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronUp className="h-3 w-3" />
                  )}
                  <span>Frequent questions</span>
                  {fqCollapsed ? (
                    <span className="ml-1 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[9px] font-semibold normal-case tracking-normal text-zinc-600">
                      {stripVisibleCount} hidden
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={fqCtl.toggle}
                  className="inline-flex items-center gap-1 rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                  aria-label={fqCollapsed ? 'Show frequent questions' : 'Hide frequent questions'}
                  title={fqCollapsed ? 'Show' : 'Hide'}
                >
                  {fqCollapsed ? (
                    <Maximize2 className="h-3 w-3" />
                  ) : (
                    <Minimize2 className="h-3 w-3" />
                  )}
                </button>
              </div>
              {!fqCollapsed ? (
                <div
                  id="frequent-questions-strip"
                  className="flex flex-wrap gap-2 animate-in fade-in slide-in-from-top-1 duration-150"
                >
                  {quickPrompts.slice(0, 6).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onQuickPrompt(p.prompt)}
                      className={cn(
                        'rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium transition',
                        isSending
                          ? 'cursor-not-allowed text-zinc-400'
                          : 'text-zinc-800 hover:border-zinc-950 hover:bg-zinc-50',
                      )}
                      title={p.prompt}
                      disabled={isSending}
                    >
                      {p.label ?? p.prompt}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          <div
            className={cn(
              'rounded-3xl border bg-white shadow-soft transition',
              isSending ? 'border-zinc-200 opacity-90' : 'border-zinc-300',
            )}
          >
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (!isSending) onSend();
                }
              }}
              placeholder={
                isSending
                  ? 'STORE AI is composing a reply…'
                  : 'Ask anything about your store — sales, stock, recipes, attendance…'
              }
              rows={2}
              disabled={isSending}
              className="block w-full resize-none rounded-3xl bg-transparent px-5 pb-2 pt-4 text-sm focus:outline-none disabled:cursor-not-allowed"
            />
            <div className="flex items-center justify-between px-3 pb-3">
              <p className="text-xs text-zinc-400">
                Press <kbd className="rounded border border-zinc-300 px-1 text-[10px]">Enter</kbd> to send · <kbd className="rounded border border-zinc-300 px-1 text-[10px]">Shift</kbd>+<kbd className="rounded border border-zinc-300 px-1 text-[10px]">Enter</kbd> for newline
              </p>
              <Button onClick={onSend} disabled={isSending || draft.trim().length === 0}>
                {isSending ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Sending
                  </>
                ) : (
                  <>
                    <Send className="mr-1.5 h-4 w-4" /> Send
                  </>
                )}
              </Button>
            </div>
          </div>
          {error ? (
            <p className="mt-2 flex items-center gap-1 text-xs text-red-600">
              <X className="h-3 w-3" /> {error}
            </p>
          ) : (
            <p className="mt-2 text-xs text-zinc-400">
              AI uses read-only tools (sales summary, low-stock, recipes, stores, employees) — never edits data.
            </p>
          )}
        </div>
      </div>
    </>
  );
}

function ThinkingPlaceholder({
  tools,
}: {
  tools: Array<{ tool: string; input?: Record<string, unknown> }>;
}): JSX.Element {
  // While we don't have any real tool-call data, cycle through friendly
  // progress messages so the user sees something happening. The real tool
  // chips (if/when they arrive) take over once `tools.length > 0`.
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (tools.length > 0) return;
    const messages = [
      'Reading your question…',
      'Picking the right tool…',
      'Querying your business data…',
      'Composing a grounded answer…',
    ];
    const interval = setInterval(() => {
      setStage((s) => (s + 1) % messages.length);
    }, 1400);
    return () => clearInterval(interval);
  }, [tools.length]);
  const messages = [
    'Reading your question…',
    'Picking the right tool…',
    'Querying your business data…',
    'Composing a grounded answer…',
  ];
  const display = tools.length > 0
    ? `Querying your data with ${tools.length} tool${tools.length === 1 ? '' : 's'}…`
    : messages[stage];
  return (
    <div className="flex w-full justify-start animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="max-w-[85%] rounded-3xl border border-zinc-200 bg-white px-4 py-3 text-sm shadow-soft">
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          <Sparkles className="h-3 w-3 animate-pulse" /> STORE AI
        </div>
        <div className="flex items-center gap-2 text-zinc-700" key={stage}>
          <span className="flex gap-1" aria-hidden>
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400" />
          </span>
          <span className="text-sm">{display}</span>
        </div>
        {tools.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            <Wrench className="h-3 w-3" />
            <span>Tools:</span>
            {tools.map((tc, idx) => (
              <span
                key={`${tc.tool}-${idx}`}
                title={tc.input ? JSON.stringify(tc.input) : undefined}
                className="rounded-full bg-zinc-100 px-2 py-0.5 font-mono normal-case tracking-normal text-zinc-700"
              >
                {tc.tool}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function EmptyChat({
  quickPrompts,
  onQuickPrompt,
  disabled,
}: {
  quickPrompts: QuickPromptItem[];
  onQuickPrompt: (prompt: string) => void;
  disabled: boolean;
}): JSX.Element {
  // Group frequent questions by category so users can scan them quickly.
  const groups = quickPrompts.reduce<Record<string, QuickPromptItem[]>>((acc, p) => {
    const key = (p.category ?? 'General').trim() || 'General';
    acc[key] = acc[key] ?? [];
    acc[key].push(p);
    return acc;
  }, {});
  const orderedCategories = ['Sales', 'Inventory', 'Stores', 'Finance', 'Recipes', 'Employees', 'General'].filter(
    (cat) => groups[cat]?.length,
  );
  // Empty-state uses a separate persisted key so its collapse state doesn't
  // clash with the in-flight strip's state.
  const [collapsed, ctl] = usePersistedBoolean('ai.fq.empty.collapsed', false);
  const totalCount = quickPrompts.length;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 py-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-zinc-950 text-white shadow-soft">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-xl font-bold tracking-tight text-zinc-950">Ask STORE AI</h3>
          <p className="mt-1 text-sm text-zinc-500">
            Tool-call-first assistant. Every answer comes from real queries against your MongoDB data — click any
            question below to fire it.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={ctl.toggle}
            className="flex flex-1 items-center gap-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-700"
            aria-expanded={!collapsed}
            aria-controls="frequent-questions-empty"
          >
            {collapsed ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronUp className="h-3 w-3" />
            )}
            <span>Frequent questions</span>
            {collapsed ? (
              <span className="ml-1 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[9px] font-semibold normal-case tracking-normal text-zinc-600">
                {totalCount} hidden
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={ctl.toggle}
            className="inline-flex items-center gap-1 rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
            aria-label={collapsed ? 'Show frequent questions' : 'Hide frequent questions'}
            title={collapsed ? 'Show suggestions' : 'Hide suggestions'}
          >
            {collapsed ? (
              <Maximize2 className="h-3 w-3" />
            ) : (
              <Minimize2 className="h-3 w-3" />
            )}
          </button>
          {!collapsed ? <span className="h-px flex-1 bg-zinc-200" /> : null}
        </div>
        {!collapsed ? (
          orderedCategories.length === 0 ? (
            <p className="text-sm text-zinc-500">No suggested questions yet.</p>
          ) : (
            <div
              id="frequent-questions-empty"
              className="grid w-full grid-cols-1 gap-3 md:grid-cols-2 animate-in fade-in slide-in-from-top-1 duration-150"
            >
              {orderedCategories.flatMap((category) =>
                (groups[category] ?? []).map((p) => (
                  <button
                    key={`${category}-${p.id}`}
                    type="button"
                    onClick={() => onQuickPrompt(p.prompt)}
                    disabled={disabled}
                    className={cn(
                      'group flex items-start gap-3 rounded-2xl border bg-white p-3 text-left transition',
                      disabled
                        ? 'cursor-not-allowed border-zinc-200 opacity-60'
                        : 'border-zinc-300 hover:border-zinc-950 hover:bg-zinc-50',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-[10px] font-semibold uppercase tracking-wide transition',
                        disabled
                          ? 'bg-zinc-100 text-zinc-400'
                          : 'bg-zinc-100 text-zinc-700 group-hover:bg-zinc-950 group-hover:text-white',
                      )}
                    >
                      {category.slice(0, 3)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                        {category}
                      </span>
                      <span className="mt-0.5 block text-sm font-semibold text-zinc-900">
                        {p.label ?? p.prompt}
                      </span>
                      {p.label && p.label !== p.prompt ? (
                        <span className="mt-1 block text-xs text-zinc-500 line-clamp-2">{p.prompt}</span>
                      ) : null}
                    </span>
                  </button>
                )),
              )}
            </div>
          )
        ) : null}
      </div>

      {!collapsed ? (
        <p className="text-center text-xs text-zinc-400">
          Or just type your own question below — STORE AI will pick the right tool.
        </p>
      ) : (
        <button
          type="button"
          onClick={ctl.toggle}
          className="mx-auto inline-flex items-center gap-1 rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-700"
        >
          <Sparkles className="h-3 w-3" />
          Show {totalCount} suggestion{totalCount === 1 ? '' : 's'}
        </button>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: AIMessage }): JSX.Element {
  const isUser = message.role === 'user';
  const isTool = message.role === 'tool';
  const hasTools = (message.toolCalls?.length ?? 0) > 0;
  return (
    <div className={cn('flex w-full animate-in fade-in slide-in-from-bottom-2 duration-200', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-3xl px-4 py-3 text-sm shadow-soft',
          isUser ? 'bg-zinc-950 text-white' : 'bg-white text-zinc-900',
          isTool && 'border border-dashed border-zinc-300 italic text-zinc-500',
        )}
      >
        {!isUser && !isTool ? (
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            <Sparkles className="h-3 w-3" /> STORE AI
          </div>
        ) : null}
        <div className="whitespace-pre-wrap">{message.content}</div>
        {hasTools ? (
          <div
            className={cn(
              'mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider',
              isUser ? 'text-white/70' : 'text-zinc-500',
            )}
          >
            <Wrench className="h-3 w-3" />
            <span>Tools:</span>
            {(message.toolCalls ?? []).map((tc, idx) => (
              <span
                key={`${tc.tool}-${idx}`}
                title={tc.input ? JSON.stringify(tc.input) : undefined}
                className={cn(
                  'cursor-default rounded-full px-2 py-0.5 font-mono normal-case tracking-normal',
                  isUser ? 'bg-white/10' : 'bg-zinc-100',
                )}
              >
                {tc.tool}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DataToolsRail(): JSX.Element {
  const manifest = useMcpManifest();
  const status = useMcpStatus();
  const collections = manifest.data?.collections ?? [];
  const blocked = manifest.data?.blockedOperators ?? [];
  const stages = manifest.data?.blockedStages ?? [];

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-auto pr-1">
      <div className="rounded-2xl border border-zinc-200 bg-white p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">MongoDB MCP</p>
        <p className="mt-2 flex items-center gap-2 text-sm font-bold text-zinc-950">
          <span
            className={cn(
              'inline-flex h-2 w-2 rounded-full',
              status.data?.ok ? 'bg-emerald-500' : 'bg-amber-500',
            )}
          />
          {status.data?.ok ? 'Connected · read-only' : 'Checking connection…'}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Server version: {status.data?.version ?? 'unknown'} · scoped to your businessId.
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Available tools</p>
        <p className="mt-1 text-[11px] text-zinc-500">
          These are the tools the assistant can call to read your business data.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(manifest.data?.tools ?? []).map((name) => (
            <span key={name} className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-mono font-semibold text-zinc-700">
              {name}
            </span>
          ))}
          {(manifest.data?.tools ?? []).length === 0 ? (
            <span className="text-[11px] text-zinc-500">No tools discovered yet.</span>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Collections</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {collections.map((name) => (
            <span key={name} className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-700">
              {name}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Blocked operators</p>
        <p className="mt-1 text-[11px] text-zinc-500">
          The bridge refuses these for safety — even if a model attempts them.
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          {blocked.map((op) => (
            <span key={op} className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-mono text-red-700">
              {op}
            </span>
          ))}
          {stages.map((stage) => (
            <span key={stage} className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-mono text-red-700">
              {stage}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function DataToolsPanel(): JSX.Element {
  const manifest = useMcpManifest();
  const collections = manifest.data?.collections ?? [];

  const [collection, setCollection] = useState<string>('sales');
  const [filterText, setFilterText] = useState('{"channel": "POS"}');
  const [limit, setLimit] = useState(20);
  const [result, setResult] = useState<{ docs: unknown[]; meta: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (collections.length > 0 && !collections.includes(collection)) {
      setCollection(collections[0]);
    }
  }, [collections, collection]);

  async function runFind(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      const filter = filterText.trim() ? JSON.parse(filterText) : undefined;
      const docs = (await mcpFind({ collection, filter, limit })) as unknown[];
      setResult({ docs, meta: `${docs.length} document(s) from ${collection}` });
    } catch (err) {
      const message = err instanceof ApiException ? err.message : (err as Error).message;
      setError(message);
    } finally {
      setPending(false);
    }
  }

  async function runCount(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      const filter = filterText.trim() ? JSON.parse(filterText) : undefined;
      const out = await mcpCount({ collection, filter });
      setResult({ docs: [out], meta: `count(${collection}) = ${out.count}` });
    } catch (err) {
      const message = err instanceof ApiException ? err.message : (err as Error).message;
      setError(message);
    } finally {
      setPending(false);
    }
  }

  async function runAggregate(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      const pipeline = JSON.parse(filterText);
      if (!Array.isArray(pipeline)) throw new Error('Pipeline must be a JSON array');
      const docs = (await mcpAggregate({ collection, pipeline, limit })) as unknown[];
      setResult({ docs, meta: `${docs.length} result(s) from ${collection}` });
    } catch (err) {
      const message = err instanceof ApiException ? err.message : (err as Error).message;
      setError(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-zinc-950">Read-only data explorer</h2>
          <p className="text-xs text-zinc-500">
            Run safe MongoDB queries against your business data. Results are scoped automatically.
          </p>
        </div>
        <Badge>Scoped by businessId</Badge>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="flex flex-col gap-3 overflow-auto border-r border-zinc-200 p-6">
          <div>
            <label htmlFor="collection" className="block text-xs font-medium text-zinc-500">Collection</label>
            <select
              id="collection"
              value={collection}
              onChange={(e) => setCollection(e.target.value)}
              className="mt-1 w-full rounded-2xl border border-zinc-300 bg-white px-3 py-2 text-sm"
            >
              {collections.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="filter" className="block text-xs font-medium text-zinc-500">
              {collection === 'sales' ? 'Filter (JSON object) — or pipeline (JSON array) for aggregate' : 'Filter or pipeline (JSON)'}
            </label>
            <textarea
              id="filter"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              rows={8}
              className="mt-1 w-full rounded-2xl border border-zinc-300 bg-white p-3 font-mono text-xs"
              spellCheck={false}
            />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="limit" className="flex-1 text-xs font-medium text-zinc-500">Limit</label>
            <input
              id="limit"
              type="number"
              min={1}
              max={500}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value) || 50)}
              className="w-24 rounded-2xl border border-zinc-300 bg-white px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Button onClick={() => void runFind()} disabled={pending}>
              <ArrowUp className="mr-1.5 h-3.5 w-3.5 rotate-45" /> find
            </Button>
            <Button onClick={() => void runCount()} disabled={pending} variant="outline">
              count
            </Button>
            <Button onClick={() => void runAggregate()} disabled={pending} variant="outline">
              aggregate
            </Button>
          </div>
          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              <p className="font-semibold">Query failed</p>
              <p className="mt-1 break-words">{error}</p>
            </div>
          ) : null}
          <p className="mt-auto text-[11px] text-zinc-500">
            Operators like <code className="font-mono">$where</code>, <code className="font-mono">$out</code>, <code className="font-mono">$merge</code> are blocked. businessId is injected automatically.
          </p>
        </div>

        <div className="flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-3 text-xs text-zinc-500">
            <span>{pending ? 'Running…' : result?.meta ?? 'Run a query to see results.'}</span>
            <Button
              variant="ghost"
              onClick={() => {
                setResult(null);
                setError(null);
              }}
            >
              <Plus className="mr-1 h-3.5 w-3.5 rotate-45" /> clear
            </Button>
          </div>
          <pre className="flex-1 overflow-auto bg-zinc-950 px-6 py-4 font-mono text-[11px] text-emerald-100">
            {result ? JSON.stringify(result.docs, null, 2) : '// no results yet'}
          </pre>
        </div>
      </div>
    </div>
  );
}

// Small inline icon so we don't need to add another lucide import.
function RefreshIcon(): JSX.Element {
  return (
    <svg
      className="mr-2 inline-block h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}
