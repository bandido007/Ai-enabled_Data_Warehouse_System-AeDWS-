import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-sm border border-transparent font-sans text-sm font-medium transition-standard disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:
          'bg-brand-teal px-4 py-2 text-surface hover:bg-brand-teal-hover active:bg-brand-teal-pressed',
        secondary:
          'border-border bg-surface px-4 py-2 text-text-primary hover:border-text-tertiary',
        ghost: 'bg-transparent px-4 py-2 text-text-primary hover:bg-border-subtle',
        destructive:
          'border-semantic-error bg-transparent px-4 py-2 text-semantic-error hover:bg-semantic-error-bg',
      },
      size: {
        default: 'h-9',
        sm: 'h-7 px-2.5 text-xs',
        icon: 'h-8 w-8 px-0',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'

    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
