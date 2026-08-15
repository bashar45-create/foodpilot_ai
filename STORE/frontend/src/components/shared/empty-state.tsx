import { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }): JSX.Element {
  return (
    <Card className="flex flex-col items-center justify-center gap-4 py-14 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-950 text-white">•</div>
      <div>
        <h3 className="text-lg font-bold tracking-tight text-zinc-950">{title}</h3>
        <p className="mt-2 max-w-md text-sm text-zinc-500">{description}</p>
      </div>
      {action ?? <Button>Refresh</Button>}
    </Card>
  );
}
