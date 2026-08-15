import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>): JSX.Element {
  return <span className={cn('inline-flex items-center rounded-full border border-zinc-300 bg-zinc-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-700', className)} {...props} />;
}
