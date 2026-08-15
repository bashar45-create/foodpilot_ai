import { Bell, Check } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useNotifications, useMarkNotificationRead } from '@/features/notifications/hooks/use-notifications';
import { useActiveStore } from '@/hooks/use-active-store';
import { ApiException } from '@/types/api';

export function NotificationsPage(): JSX.Element {
  const { storeId } = useActiveStore();
  const { data: notifications = [], isLoading } = useNotifications(storeId ?? undefined);
  const markRead = useMarkNotificationRead();

  const unread = notifications.filter((n) => !n.read);

  async function onMarkRead(id: string) {
    try {
      await markRead.mutateAsync(id);
    } catch (error) {
      toast.error(error instanceof ApiException ? error.message : 'Failed to update notification');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">
          {notifications.length} total · {unread.length} unread
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : notifications.length === 0 ? (
        <Card className="p-12 text-center">
          <Bell className="mx-auto h-10 w-10 text-zinc-300" />
          <p className="mt-4 text-sm text-zinc-500">You're all caught up.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <Card
              key={n.id}
              className={`flex items-start gap-3 p-4 ${n.read ? 'bg-white' : 'bg-indigo-50/60'}`}
            >
              <div className="mt-1">
                <Badge>{n.type}</Badge>
              </div>
              <div className="flex-1">
                <p className="font-semibold text-zinc-950">{n.title}</p>
                <p className="mt-1 text-sm text-zinc-600">{n.message}</p>
                <p className="mt-2 text-xs text-zinc-400">
                  {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                </p>
              </div>
              {!n.read ? (
                <Button variant="outline" onClick={() => onMarkRead(n.id)} disabled={markRead.isPending} className="px-3 py-1 text-xs">
                  <Check className="mr-1 h-3 w-3" /> Mark read
                </Button>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
