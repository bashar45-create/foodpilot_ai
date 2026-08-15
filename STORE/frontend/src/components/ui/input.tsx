import { forwardRef, type InputHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'h-11 w-full rounded-2xl border border-zinc-300 bg-white px-4 text-sm text-zinc-950 outline-none transition placeholder:text-zinc-400 hover:border-zinc-400 focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/10',
          className,
        )}
        {...props}
      />
    );
  },
);
