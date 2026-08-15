import type { ReactNode } from 'react';

import { Card } from '@/components/ui/card';

export function FormDialog({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <Card className="space-y-4">
      <div>
        <h3 className="text-lg font-bold tracking-tight">{title}</h3>
      </div>
      {children}
    </Card>
  );
}
