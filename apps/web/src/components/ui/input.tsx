import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    className={cn(
      'flex h-12 w-full rounded-2xl border-4 border-ink/15 bg-white px-4 text-base font-semibold text-ink shadow-pop-sm placeholder:text-ink/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky/50 disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    ref={ref}
    {...props}
  />
));
Input.displayName = 'Input';
