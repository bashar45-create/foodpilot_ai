import { useEffect, type HTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children?: ReactNode;
  className?: string;
}

export function Dialog({ open, onOpenChange, title, description, children, className }: DialogProps) {
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 p-4"
      onClick={() => onOpenChange(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative max-h-[90vh] w-full max-w-lg overflow-auto rounded-3xl border border-zinc-300 bg-white p-6 shadow-2xl',
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 rounded-full p-1 text-zinc-500 hover:bg-zinc-100"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
        {title ? <h2 className="text-lg font-bold tracking-tight text-zinc-950">{title}</h2> : null}
        {description ? <p className="mt-1 text-sm text-zinc-500">{description}</p> : null}
        <div className="mt-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-4 flex flex-col gap-1', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('mt-6 flex flex-wrap items-center justify-end gap-2', className)}
      {...props}
    />
  );
}