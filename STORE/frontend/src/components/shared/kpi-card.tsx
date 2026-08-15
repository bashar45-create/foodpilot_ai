import { ArrowUpRight } from 'lucide-react';

import { Card } from '@/components/ui/card';

export function KpiCard({ label, value, delta }: { label: string; value: string; delta?: string }): JSX.Element {
  return (
    <Card className="flex flex-col gap-3">
      <p className="text-sm font-medium text-zinc-500">{label}</p>
      <div className="flex items-end justify-between gap-3">
        <p className="text-3xl font-black tracking-tight text-zinc-950">{value}</p>
        {delta ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-zinc-950 px-3 py-1 text-xs font-semibold text-white">
            <ArrowUpRight className="h-3.5 w-3.5" />
            {delta}
          </span>
        ) : null}
      </div>
    </Card>
  );
}
