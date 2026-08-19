import type { ReactNode } from 'react';

import { Card } from '@/components/ui/card';

export function AuthPanel({ title, description, children }: { title: string; description: string; children: ReactNode }): JSX.Element {
  return (
    <Card className="mx-auto w-full max-w-md space-y-6 p-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">FOODPILOT_AI</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-zinc-950">{title}</h1>
        <p className="mt-2 text-sm text-zinc-500">{description}</p>
      </div>
      {children}
    </Card>
  );
}


/* Summary: This file contains the  logic for the frontend. */