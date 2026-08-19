import { cn } from '@/lib/utils';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-2xl bg-zinc-100', className)} />;
}


/* Summary: This file contains the  logic for the frontend. */