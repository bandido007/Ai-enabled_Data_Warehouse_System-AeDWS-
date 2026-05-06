import { Expand, ScanSearch, ZoomIn, ZoomOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

interface DocumentToolbarProps {
  currentPage: number
  totalPages: number
  zoomLabel: string
  onZoomOut: () => void
  onZoomIn: () => void
  onFitWidth: () => void
  onFitPage: () => void
}

export function DocumentToolbar({
  currentPage,
  totalPages,
  zoomLabel,
  onZoomOut,
  onZoomIn,
  onFitWidth,
  onFitPage,
}: DocumentToolbarProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
      <div className="font-mono text-xs uppercase tracking-[0.05em] text-text-tertiary">
        {t('documentReview.viewer.pageLabel', { current: currentPage, total: totalPages || 1 })}
      </div>
      <div className="flex items-center gap-2">
        <Button size="icon" variant="secondary" type="button" onClick={onZoomOut} aria-label={t('documentReview.viewer.zoomOut')}>
          <ZoomOut className="h-4 w-4" />
        </Button>
        <div className="min-w-16 rounded-sm border border-border bg-canvas px-2 py-1 text-center font-mono text-xs text-text-secondary">
          {zoomLabel}
        </div>
        <Button size="icon" variant="secondary" type="button" onClick={onZoomIn} aria-label={t('documentReview.viewer.zoomIn')}>
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="secondary" type="button" onClick={onFitWidth}>
          <Expand className="h-4 w-4" />
          {t('documentReview.viewer.fitWidth')}
        </Button>
        <Button size="sm" variant="secondary" type="button" onClick={onFitPage}>
          <ScanSearch className="h-4 w-4" />
          {t('documentReview.viewer.fitPage')}
        </Button>
      </div>
    </div>
  )
}
