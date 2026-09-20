import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl font-bold transition-transform focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sun/70 disabled:pointer-events-none disabled:opacity-50 active:translate-y-1 active:shadow-none',
  {
    variants: {
      variant: {
        default: 'bg-grape text-white shadow-pop hover:brightness-110',
        coral: 'bg-coral text-white shadow-pop hover:brightness-110',
        mint: 'bg-mint text-ink shadow-pop hover:brightness-110',
        sky: 'bg-sky text-ink shadow-pop hover:brightness-110',
        sun: 'bg-sun text-ink shadow-pop hover:brightness-110',
        outline:
          'border-4 border-ink/20 bg-white/80 text-ink shadow-pop-sm hover:bg-white',
        ghost: 'text-ink hover:bg-white/40 shadow-none active:translate-y-0',
      },
      size: {
        default: 'h-12 px-5 text-base',
        sm: 'h-10 px-4 text-sm',
        lg: 'h-14 px-6 text-lg',
        xl: 'h-16 px-4 text-lg md:text-xl',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
