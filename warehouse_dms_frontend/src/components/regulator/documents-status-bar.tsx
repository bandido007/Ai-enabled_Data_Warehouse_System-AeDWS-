import { useMemo } from 'react'

import { cn } from '@/lib/utils'

export function DocumentsStatusBar({ counts }: { counts: Record<string, number> }) {
  const { approved, rejected, pending, total } = useMemo(() => {
    const approvedCount = counts.APPROVED ?? 0
    const rejectedCount = counts.REJECTED ?? 0
    const totalCount = Object.values(counts).reduce((sum, value) => sum + value, 0)
    const pendingCount = Math.max(0, totalCount - approvedCount - rejectedCount)

    return {
      approved: approvedCount,
      rejected: rejectedCount,
      pending: pendingCount,
      total: totalCount,
    }
  }, [counts])

  if (!total) {
    return <div className="text-sm text-text-tertiary">0</div>
  }

  const segments = [
    { key: 'approved', value: approved, className: 'bg-semantic-success' },
    { key: 'pending', value: pending, className: 'bg-semantic-warning' },
    { key: 'rejected', value: rejected, className: 'bg-semantic-error' },
  ].filter((segment) => segment.value > 0)

  return (
    <div className="flex items-center gap-3">
      <div className="flex h-2.5 min-w-[112px] flex-1 overflow-hidden rounded-full bg-border-subtle">
        {segments.map((segment) => (
          <div
            key={segment.key}
            className={cn('h-full', segment.className)}
            style={{ width: `${(segment.value / total) * 100}%` }}
            title={`${segment.key}: ${segment.value}`}
          />
        ))}
      </div>
      <span className="min-w-8 text-right font-mono text-xs text-text-tertiary">{total}</span>
    </div>
  )
}
