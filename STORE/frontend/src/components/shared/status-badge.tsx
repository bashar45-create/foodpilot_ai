import { Badge } from '@/components/ui/badge';

export function StatusBadge({ status }: { status: string }): JSX.Element {
  const upper = status.toUpperCase();
  const isPositive = ['OPEN', 'ACTIVE', 'APPROVED', 'COMPLETED', 'RESOLVED'].includes(upper);
  const isWarning = ['DRAFT', 'MEDIUM', 'PENDING', 'IN_PROGRESS'].includes(upper);
  const tone = isPositive ? 'border-zinc-950 bg-zinc-950 text-white' : isWarning ? 'border-zinc-300 bg-zinc-100 text-zinc-700' : 'border-zinc-200 bg-white text-zinc-500';

  return <Badge className={tone}>{status}</Badge>;
}
