import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface DropdownProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: 'start' | 'end';
  className?: string;
}

export function DropdownMenu({ trigger, children, align = 'end', className }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center"
      >
        {trigger}
      </button>
      {open ? (
        <div
          role="menu"
          className={cn(
            'absolute z-30 mt-2 min-w-[10rem] rounded-2xl border border-zinc-300 bg-white p-1 shadow-soft',
            align === 'end' ? 'right-0' : 'left-0',
            className,
          )}
        >
          <div onClick={() => setOpen(false)}>{children}</div>
        </div>
      ) : null}
    </div>
  );
}

export function DropdownItem({
  children,
  onSelect,
  variant = 'default',
  disabled,
  className,
}: {
  children: ReactNode;
  onSelect?: () => void;
  variant?: 'default' | 'danger';
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition disabled:opacity-50',
        variant === 'danger' ? 'text-red-600 hover:bg-red-50' : 'text-zinc-800 hover:bg-zinc-50',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function DropdownSeparator() {
  return <div className="my-1 h-px bg-zinc-200" />;
}