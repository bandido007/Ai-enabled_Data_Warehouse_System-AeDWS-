import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface PageThumbnailsProps {
  totalPages: number
  currentPage: number
  onSelect: (page: number) => void
  renderThumbnail: (page: number) => ReactNode
}

export function PageThumbnails({ totalPages, currentPage, onSelect, renderThumbnail }: PageThumbnailsProps) {
  if (totalPages <= 1) {
    return null
  }

  return (
    <div className="flex gap-3 overflow-x-auto border-t border-border bg-surface px-4 py-3 scrollbar-thin">
      {Array.from({ length: totalPages }).map((_, index) => {
        const page = index + 1
        return (
          <button
            key={page}
            type="button"
            onClick={() => onSelect(page)}
            className={cn(
              'shrink-0 rounded-md border bg-canvas p-2 transition-standard',
              currentPage === page ? 'border-brand-teal shadow-sm' : 'border-border hover:border-text-tertiary'
            )}
          >
            <div className="mb-2 overflow-hidden rounded-sm border border-border-subtle bg-surface">{renderThumbnail(page)}</div>
            <div className="text-center font-mono text-[11px] text-text-tertiary">{page}</div>
          </button>
        )
      })}
    </div>
  )
}
