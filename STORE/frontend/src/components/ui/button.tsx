import { cloneElement, isValidElement, type ButtonHTMLAttributes, type ReactElement, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

type ButtonVariant = 'default' | 'outline' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  asChild?: boolean;
  children?: ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  default: 'bg-zinc-950 text-white hover:bg-zinc-800 shadow-soft',
  outline: 'border border-zinc-300 bg-white text-zinc-950 hover:border-zinc-400 hover:bg-zinc-50',
  ghost: 'bg-transparent text-zinc-950 hover:bg-zinc-100',
  danger: 'bg-zinc-950 text-white hover:bg-zinc-700',
};

export function Button({ className, variant = 'default', type = 'button', asChild = false, children, ...props }: ButtonProps): JSX.Element {
  const baseClassName = cn('inline-flex items-center justify-center rounded-2xl px-4 py-2 text-sm font-semibold transition', variantStyles[variant], className);

  if (asChild && isValidElement(children)) {
    return cloneElement(children as ReactElement<{ className?: string }>, {
      className: cn(baseClassName, (children as ReactElement<{ className?: string }>).props.className),
    });
  }

  return (
    <button type={type} className={baseClassName} {...props}>
      {children}
    </button>
  );
}
