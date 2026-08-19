import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element {
  return <div className={cn('rounded-3xl border border-zinc-300 bg-white p-6 shadow-soft', className)} {...props} />;
}


/* Summary: This file contains the  logic for the frontend. */