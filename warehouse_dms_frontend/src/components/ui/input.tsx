import * as React from 'react'

import { cn } from '@/lib/utils'

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          'flex h-9 w-full rounded-sm border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary placeholder:italic hover:border-text-tertiary focus:border-brand-teal focus:shadow-[0_0_0_3px_var(--focus-ring)] disabled:cursor-not-allowed disabled:bg-border-subtle disabled:text-text-disabled',
          className
        )}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'

export { Input }
