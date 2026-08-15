import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface TabItem {
  value: string;
  label: ReactNode;
  content: ReactNode;
}

export function Tabs({
  items,
  defaultValue,
  value,
  onValueChange,
  className,
}: {
  items: TabItem[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (v: string) => void;
  className?: string;
}) {
  const [internal, setInternal] = useState(defaultValue ?? items[0]?.value);
  const active = value ?? internal;
  const setActive = (v: string) => {
    setInternal(v);
    onValueChange?.(v);
  };
  const current = items.find((i) => i.value === active) ?? items[0];
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className="flex flex-wrap gap-1 rounded-2xl border border-zinc-200 bg-white p-1">
        {items.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setActive(item.value)}
            className={cn(
              'rounded-xl px-3 py-1.5 text-sm font-medium transition',
              active === item.value ? 'bg-zinc-950 text-white' : 'text-zinc-600 hover:bg-zinc-100',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div>{current?.content}</div>
    </div>
  );
}