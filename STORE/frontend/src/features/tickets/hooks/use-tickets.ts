import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ticketKeys } from '@/api/queryKeys';
import {
  addTicketComment,
  assignTicket,
  fetchTicket,
  fetchTickets,
  setTicketStatus,
  type Ticket,
  type TicketStatus,
} from '@/api/endpoints/tickets';
import { useSyncAwareRefetchInterval } from '@/lib/sync/useSyncAwareRefetchInterval';

export function useTickets(status?: string): {
  data: Ticket[] | undefined;
  isLoading: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;
  isFetching: boolean;
} {
  const refetchInterval = useSyncAwareRefetchInterval(15_000);
  const query = useQuery({
    queryKey: status ? [...ticketKeys.list(), status] : ticketKeys.list(),
    queryFn: () => fetchTickets(status ? { status } : undefined),
    refetchInterval,
  });
  return {
    data: query.data,
    isLoading: query.isPending,
    error: query.error,
    refetch: query.refetch,
    isFetching: query.isFetching,
  };
}

export function useTicket(id: string | null): {
  data: Ticket | undefined;
  isLoading: boolean;
} {
  const refetchInterval = useSyncAwareRefetchInterval(15_000);
  const query = useQuery({
    queryKey: id ? ticketKeys.detail(id) : ['tickets', 'detail', 'none'],
    queryFn: () => fetchTicket(id as string),
    enabled: Boolean(id),
    refetchInterval,
  });
  return { data: query.data, isLoading: query.isPending };
}

export function useSetTicketStatus(): (id: string, status: TicketStatus) => Promise<Ticket> {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TicketStatus }) => setTicketStatus(id, status),
    onSuccess: (ticket) => {
      qc.invalidateQueries({ queryKey: ticketKeys.list() });
      qc.invalidateQueries({ queryKey: ticketKeys.detail(ticket.id) });
    },
  });
  return (id: string, status: TicketStatus) => mutation.mutateAsync({ id, status });
}

export function useAssignTicket(): (id: string, assignedTo: string | null) => Promise<Ticket> {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ id, assignedTo }: { id: string; assignedTo: string | null }) => assignTicket(id, assignedTo),
    onSuccess: (ticket) => {
      qc.invalidateQueries({ queryKey: ticketKeys.list() });
      qc.invalidateQueries({ queryKey: ticketKeys.detail(ticket.id) });
    },
  });
  return (id: string, assignedTo: string | null) => mutation.mutateAsync({ id, assignedTo });
}

export function useAddTicketComment(): (id: string, text: string) => Promise<Ticket> {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => addTicketComment(id, text),
    onSuccess: (ticket) => {
      qc.invalidateQueries({ queryKey: ticketKeys.detail(ticket.id) });
    },
  });
  return (id: string, text: string) => mutation.mutateAsync({ id, text });
}
