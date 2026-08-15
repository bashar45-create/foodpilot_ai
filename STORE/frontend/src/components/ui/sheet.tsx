import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children?: ReactNode;
  className?: string;
  side?: 'right' | 'left';
}

export function Sheet({ open, onOpenChange, title, description, children, className, side = 'right' }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-zinc-950/40"
      onClick={() => onOpenChange(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'absolute top-0 flex h-full w-full max-w-md flex-col gap-4 overflow-y-auto bg-white p-6 shadow-2xl',
          side === 'right' ? 'right-0' : 'left-0',
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            {title ? <h2 className="text-lg font-bold tracking-tight text-zinc-950">{title}</h2> : null}
            {description ? <p className="mt-1 text-sm text-zinc-500">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-full p-1 text-zinc-500 hover:bg-zinc-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1">{children}</div>
      </div>
    </div>,
    document.body,
  );
}