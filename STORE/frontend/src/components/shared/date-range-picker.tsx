import { Input } from '@/components/ui/input';

export function DateRangePicker({ from, to, onChange }: { from?: string; to?: string; onChange: (range: { from?: string; to?: string }) => void }): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Input type="date" value={from ?? ''} onChange={(event) => onChange({ from: event.target.value, to })} />
      <Input type="date" value={to ?? ''} onChange={(event) => onChange({ from, to: event.target.value })} />
    </div>
  );
}
