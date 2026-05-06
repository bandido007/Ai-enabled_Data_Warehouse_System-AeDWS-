import type { ReactNode } from 'react'

import { Card, CardContent } from '@/components/ui/card'

function EmptyIllustration({ icon }: { icon: ReactNode }) {
  return (
    <div className="relative flex h-28 w-28 items-center justify-center">
      <svg viewBox="0 0 112 112" className="absolute inset-0 h-full w-full text-brand-teal/30" fill="none">
        <rect x="18" y="24" width="76" height="58" rx="12" stroke="currentColor" strokeWidth="1.5" />
        <path d="M28 40H84" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M28 52H72" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M28 64H64" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="79" cy="69" r="15" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-brand-teal/10 text-brand-teal">{icon}</div>
    </div>
  )
}

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
        <EmptyIllustration icon={icon} />
        <div>
          <h3 className="text-base font-semibold text-text-primary">{title}</h3>
          <p className="mt-1 max-w-md text-sm text-text-secondary">{description}</p>
        </div>
        {action}
      </CardContent>
    </Card>
  )
}
