import { useMemo, useState } from 'react';
import { MessageSquare, RefreshCcw, AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Sheet } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { ApiException } from '@/types/api';
import {
  useAddTicketComment,
  useAssignTicket,
  useSetTicketStatus,
  useTicket,
  useTickets,
} from '@/features/tickets/hooks/use-tickets';
import { useUsers } from '@/features/users/hooks/use-users';
import { toast } from 'sonner';
import type { Ticket, TicketStatus } from '@/api/endpoints/tickets';

const STATUS_FILTERS: Array<{ value: '' | TicketStatus; label: string }> = [
  { value: '', label: 'All' },
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'CLOSED', label: 'Closed' },
];

const STATUS_BADGE_STYLES: Record<string, string> = {
  OPEN: 'bg-amber-50 text-amber-800 border-amber-200',
  IN_PROGRESS: 'bg-blue-50 text-blue-800 border-blue-200',
  RESOLVED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  CLOSED: 'bg-zinc-100 text-zinc-700 border-zinc-300',
};

const PRIORITY_BADGE_STYLES: Record<string, string> = {
  LOW: 'bg-zinc-50 text-zinc-700 border-zinc-200',
  MEDIUM: 'bg-sky-50 text-sky-800 border-sky-200',
  HIGH: 'bg-orange-50 text-orange-800 border-orange-200',
  URGENT: 'bg-red-50 text-red-800 border-red-200',
};

function statusBadge(status: string | undefined): JSX.Element {
  const key = status ?? '';
  return <Badge className={STATUS_BADGE_STYLES[key] ?? ''}>{status || 'Unknown'}</Badge>;
}

function priorityBadge(priority: string | undefined): JSX.Element {
  const key = priority ?? 'MEDIUM';
  return <Badge className={PRIORITY_BADGE_STYLES[key] ?? PRIORITY_BADGE_STYLES.MEDIUM}>{priority || 'MEDIUM'}</Badge>;
}

function TicketDetailSheet({
  ticketId,
  open,
  onOpenChange,
}: {
  ticketId: string | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}): JSX.Element {
  const { data: ticket, isLoading } = useTicket(open ? ticketId : null);
  const { data: users = [] } = useUsers();
  const setStatus = useSetTicketStatus();
  const assign = useAssignTicket();
  const addComment = useAddTicketComment();
  const [comment, setComment] = useState('');
  const [pending, setPending] = useState(false);

  const userOptions = useMemo(
    () =>
      [...users]
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        .map((u) => ({ id: u.id, name: u.name })),
    [users],
  );

  const submitComment = async (): Promise<void> => {
    if (!ticket || !comment.trim()) return;
    setPending(true);
    try {
      await addComment(ticket.id, comment.trim());
      setComment('');
    } catch (err) {
      const msg = err instanceof ApiException ? err.message : 'Could not add comment';
      toast.error(msg);
    } finally {
      setPending(false);
    }
  };

  const changeStatus = async (next: TicketStatus): Promise<void> => {
    if (!ticket) return;
    try {
      await setStatus(ticket.id, next);
      toast.success(`Status set to ${next}`);
    } catch (err) {
      const msg = err instanceof ApiException ? err.message : 'Could not update status';
      toast.error(msg);
    }
  };

  const changeAssignee = async (next: string): Promise<void> => {
    if (!ticket) return;
    const assignedTo = next === '' ? null : next;
    try {
      await assign(ticket.id, assignedTo);
    } catch (err) {
      const msg = err instanceof ApiException ? err.message : 'Could not assign ticket';
      toast.error(msg);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {ticket ? (
        <>
          <div className="flex items-center gap-2">
            {statusBadge(ticket.status)}
            {priorityBadge(ticket.priority)}
          </div>
          <p className="text-sm text-zinc-500">
            Raised {ticket.createdAt ? formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true }) : 'recently'}
          </p>
          <Card className="bg-zinc-50">
            <p className="whitespace-pre-wrap text-sm text-zinc-800">{ticket.description}</p>
          </Card>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Status</label>
              <Select
                value={ticket.status ?? 'OPEN'}
                onChange={(e) => void changeStatus(e.target.value)}
                className="mt-1"
              >
                {STATUS_FILTERS.filter((s) => s.value !== '').map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Assignee</label>
              <Select
                value={ticket.assignedTo ?? ''}
                onChange={(e) => void changeAssignee(e.target.value)}
                className="mt-1"
              >
                <option value="">Unassigned</option>
                {userOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Comments ({ticket.comments?.length ?? 0})
            </label>
            <div className="flex-1 space-y-2 overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-3">
              {ticket.comments && ticket.comments.length > 0 ? (
                ticket.comments.map((c, idx) => (
                  <div key={idx} className="rounded-xl bg-zinc-50 px-3 py-2 text-sm">
                    <p className="whitespace-pre-wrap text-zinc-800">{c.text}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {c.authorId ?? 'unknown'} · {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-zinc-400">No comments yet.</p>
              )}
            </div>
            <Textarea
              rows={3}
              placeholder="Write a comment…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <div className="flex justify-end">
              <Button
                onClick={() => void submitComment()}
                disabled={pending || !comment.trim()}
                aria-label="Send comment"
              >
                <MessageSquare className="mr-2 h-4 w-4" />
                {pending ? 'Sending…' : 'Send'}
              </Button>
            </div>
          </div>
        </>
      ) : isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <p className="text-sm text-zinc-500">Ticket not found.</p>
      )}
    </Sheet>
  );
}

export function TicketsPage(): JSX.Element {
  const [filter, setFilter] = useState<'' | TicketStatus>('');
  const { data, isLoading, error, refetch, isFetching } = useTickets(filter || undefined);

  const tickets = data ?? [];

  const errorMessage = useMemo(() => {
    if (!error) return null;
    if (error instanceof ApiException) return error.message;
    if (error instanceof Error) return error.message;
    return 'Unknown error';
  }, [error]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { OPEN: 0, IN_PROGRESS: 0, RESOLVED: 0, CLOSED: 0 };
    for (const t of tickets) {
      const key = (t.status ?? '').toUpperCase();
      if (key in c) c[key] += 1;
    }
    return c;
  }, [tickets]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const selectTicket = (id: string): void => {
    setSelectedId(id);
    setDetailOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tickets</h1>
          <p className="text-sm text-zinc-500">Issues raised by workers. New tickets appear in real time.</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={filter} onChange={(e) => setFilter(e.target.value as '' | TicketStatus)} className="w-48">
            {STATUS_FILTERS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
          <Button variant="outline" onClick={() => void refetch()} aria-label="Refresh tickets">
            <RefreshCcw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Open</p>
          <p className="mt-1 text-2xl font-bold">{counts.OPEN}</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">In progress</p>
          <p className="mt-1 text-2xl font-bold">{counts.IN_PROGRESS}</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Resolved</p>
          <p className="mt-1 text-2xl font-bold">{counts.RESOLVED}</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Closed</p>
          <p className="mt-1 text-2xl font-bold">{counts.CLOSED}</p>
        </Card>
      </div>

      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Open</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : error ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center">
                  <div className="mx-auto inline-flex flex-col items-center gap-2 py-6 text-sm text-red-600">
                    <AlertCircle className="h-5 w-5" />
                    <p className="font-semibold">Failed to load tickets</p>
                    <p className="text-xs text-zinc-500">{errorMessage}</p>
                    <Button variant="outline" onClick={() => void refetch()} className="mt-1">
                      Retry
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : tickets.length === 0 ? (
              <TableEmpty colspan={5}>No tickets to show.</TableEmpty>
            ) : (
              tickets.map((t) => (
                <TableRow
                  key={t.id}
                  className="cursor-pointer"
                  onClick={() => selectTicket(t.id)}
                >
                  <TableCell>
                    <p className="font-medium">{t.title}</p>
                    <p className="line-clamp-1 text-xs text-zinc-500">{t.description}</p>
                  </TableCell>
                  <TableCell>{statusBadge(t.status)}</TableCell>
                  <TableCell>{priorityBadge(t.priority)}</TableCell>
                  <TableCell className="text-xs text-zinc-500">
                    {t.createdAt ? formatDistanceToNow(new Date(t.createdAt), { addSuffix: true }) : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost">Open</Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <TicketDetailSheet ticketId={selectedId} open={detailOpen} onOpenChange={setDetailOpen} />
    </div>
  );
}
