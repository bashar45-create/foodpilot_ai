import { memo, useCallback, useState } from 'react';
import { FlatList, ListRenderItem, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AppScreen } from '@/components/AppScreen';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/PrimaryButton';
import { StatusChip } from '@/components/StatusChip';
import { AppText } from '@/lib/typography';
import { useAuth } from '@/context/AuthContext';
import {
  createTicket,
  listTickets,
  type CreateTicketRequest,
  type Ticket,
} from '@/api/endpoints/tickets';
import { ApiException } from '@/types/api';
import { colors } from '@/lib/colors';
import { useSyncAwareRefetchInterval } from '@/lib/sync/useSyncAwareRefetchInterval';

type Priority = NonNullable<CreateTicketRequest['priority']>;

const PRIORITIES: Priority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

function toneFor(status?: string): 'plain' | 'accent' | 'danger' | 'solid' {
  switch ((status ?? '').toUpperCase()) {
    case 'RESOLVED':
    case 'CLOSED':
      return 'solid';
    case 'IN_PROGRESS':
      return 'accent';
    case 'OPEN':
      return 'plain';
    default:
      return 'plain';
  }
}

const TicketRow = memo(function TicketRow({ ticket }: { ticket: Ticket }): JSX.Element {
  return (
    <Card>
      <View style={styles.rowSpread}>
        <AppText variant="heading" style={styles.rowTitle}>{ticket.title}</AppText>
        <StatusChip
          tone={(ticket.priority ?? '').toUpperCase() === 'URGENT' ? 'solid' : 'accent'}
          label={ticket.priority ?? 'NORMAL'}
        />
      </View>
      {ticket.description ? <AppText variant="body">{ticket.description}</AppText> : null}
      <View style={styles.rowSpread}>
        <StatusChip tone={toneFor(ticket.status)} label={ticket.status ?? 'OPEN'} />
        <AppText variant="caption">
          {ticket.createdAt ? new Date(ticket.createdAt).toLocaleString() : ''}
        </AppText>
      </View>
    </Card>
  );
});

interface ComposerProps {
  visible: boolean;
  onClose: () => void;
  onSubmitted: () => void;
  defaultStoreId: string;
}

function TicketComposer({
  visible,
  onClose,
  onSubmitted,
  defaultStoreId,
}: ComposerProps): JSX.Element {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('NORMAL');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (input: CreateTicketRequest) => createTicket(input),
    onSuccess: () => {
      setTitle('');
      setDescription('');
      setPriority('NORMAL');
      onSubmitted();
    },
  });

  const submit = useCallback((): void => {
    if (!title.trim()) {
      setError('Give the ticket a short title.');
      return;
    }
    setError(null);
    mutation.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      storeId: defaultStoreId || null,
    });
  }, [title, description, priority, defaultStoreId, mutation]);

  const renderPriority = useCallback(
    (p: Priority) => {
      const selected = priority === p;
      return (
        <Pressable
          key={p}
          onPress={() => setPriority(p)}
          style={({ pressed }) => [
            styles.priorityChip,
            selected ? styles.priorityChipSelected : null,
            pressed ? styles.pressed : null,
          ]}
        >
          <AppText variant="overline" style={selected ? styles.priorityChipTextSelected : null}>
            {p}
          </AppText>
        </Pressable>
      );
    },
    [priority],
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <View style={styles.sheet}>
          <AppText variant="title">Submit ticket</AppText>
          <AppText variant="body" faint>Admin will see this and respond.</AppText>

          <AppText variant="overline">Title</AppText>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Freezer door won't close"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
          />

          <AppText variant="overline">Description</AppText>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Add details that help admin act on this…"
            placeholderTextColor={colors.textFaint}
            multiline
            style={[styles.input, styles.textarea]}
          />

          <AppText variant="overline">Priority</AppText>
          <View style={styles.priorityRow}>{PRIORITIES.map(renderPriority)}</View>

          {error ? <AppText variant="body">{error}</AppText> : null}
          {mutation.error instanceof ApiException ? (
            <AppText variant="body">{mutation.error.message}</AppText>
          ) : null}

          <View style={styles.sheetActions}>
            <PrimaryButton label="Cancel" variant="outline" onPress={onClose} />
            <PrimaryButton
              label={mutation.isPending ? 'Submitting…' : 'Submit'}
              onPress={submit}
              disabled={mutation.isPending}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function TicketsScreenImpl(): JSX.Element {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [composerOpen, setComposerOpen] = useState(false);
  const refetchInterval = useSyncAwareRefetchInterval();

  const ticketsQuery = useQuery({
    queryKey: ['tickets', 'mine', user?.userId ?? ''],
    queryFn: listTickets,
    enabled: Boolean(user),
    refetchInterval,
  });

  const onRefresh = useCallback(() => {
    void ticketsQuery.refetch();
  }, [ticketsQuery]);

  const renderTicket: ListRenderItem<Ticket> = useCallback(
    ({ item }) => <TicketRow ticket={item} />,
    [],
  );
  const ticketKey = useCallback((t: Ticket) => t.id, []);
  const ticketSeparator = useCallback(() => <View style={styles.sep12} />, []);

  const onSubmitted = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['tickets'] });
    setComposerOpen(false);
  }, [qc]);

  return (
    <AppScreen
      title="Tickets"
      subtitle={`${ticketsQuery.data?.length ?? 0} total`}
      onRefresh={onRefresh}
      refreshing={ticketsQuery.isFetching}
    >
      <PrimaryButton
        label="+ Submit ticket"
        caption="Tell admin about an issue — equipment, supply, schedule, etc."
        onPress={() => setComposerOpen(true)}
      />

      {ticketsQuery.isLoading ? (
        <Card>
          <AppText variant="caption">Loading tickets…</AppText>
        </Card>
      ) : (ticketsQuery.data ?? []).length === 0 ? (
        <Card>
          <AppText variant="heading">No tickets yet</AppText>
          <AppText variant="body" faint>
            Use “Submit ticket” to flag an issue. Tickets help admin prioritize fixes.
          </AppText>
        </Card>
      ) : (
        <FlatList
          data={ticketsQuery.data ?? []}
          keyExtractor={ticketKey}
          renderItem={renderTicket}
          ItemSeparatorComponent={ticketSeparator}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews
          scrollEnabled={false}
        />
      )}

      <TicketComposer
        visible={composerOpen}
        onClose={() => setComposerOpen(false)}
        onSubmitted={onSubmitted}
        defaultStoreId={user?.assignedStore ?? ''}
      />
    </AppScreen>
  );
}

export const TicketsScreen = memo(TicketsScreenImpl);

const styles = StyleSheet.create({
  rowSpread: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowTitle: { flex: 1 },
  sep12: { height: 12 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.background,
    padding: 22,
    paddingBottom: 28,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1.5,
    borderColor: colors.border,
    gap: 10,
  },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.background,
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  textarea: { minHeight: 90, textAlignVertical: 'top' },
  priorityRow: { flexDirection: 'row', gap: 8 },
  priorityChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  priorityChipSelected: { backgroundColor: colors.accent },
  priorityChipTextSelected: { color: colors.accentInk },
  pressed: { backgroundColor: colors.pressed },
});
