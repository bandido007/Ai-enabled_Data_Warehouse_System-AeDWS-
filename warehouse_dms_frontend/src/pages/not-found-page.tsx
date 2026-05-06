import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas px-4 text-center">
      <div className="font-mono text-sm uppercase tracking-[0.08em] text-text-tertiary">404</div>
      <h1 className="text-2xl font-semibold text-text-primary">Page not found</h1>
      <p className="max-w-md text-sm text-text-secondary">The route exists outside the Phase 5 shell. Return to the dashboard.</p>
      <Button asChild>
        <Link to="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  )
}
