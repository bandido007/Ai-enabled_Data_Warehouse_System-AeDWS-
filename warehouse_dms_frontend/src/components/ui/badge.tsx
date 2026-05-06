import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium tracking-[0.01em]',
  {
    variants: {
      variant: {
        success: 'bg-semantic-success-bg text-semantic-success',
        warning: 'bg-semantic-warning-bg text-semantic-warning',
        error: 'bg-semantic-error-bg text-semantic-error',
        info: 'bg-semantic-info-bg text-semantic-info',
        neutral: 'bg-border-subtle text-text-secondary',
      },
      dot: {
        true: 'before:block before:h-1.5 before:w-1.5 before:rounded-full before:bg-current before:content-[""]',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'neutral',
      dot: false,
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, dot, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant, dot, className }))} {...props} />
}
