import { Info, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { ConfidenceBadge } from '@/components/common/confidence-badge'
import { StatusBadge } from '@/components/common/status-badge'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { AvailableTransition, DocumentRecord, DocumentTypeMetadata } from '@/types/api'
import { formatPercent, formatRelativeTime } from '@/lib/utils'

import { ExtractedFieldsForm } from './extracted-fields-form'
import { HistoryTimeline } from './history-timeline'
import { ReviewActionBar } from './review-action-bar'

interface ReviewPanelProps {
  document: DocumentRecord
  documentTypes: DocumentTypeMetadata[]
  availableTransitions: AvailableTransition[]
  actionLoading?: boolean
  reclassifying?: boolean
  takingLonger?: boolean
  onFieldCommit: (field: string, value: string) => Promise<void>
  onTransition: (action: string, reason: string) => void
  onReclassify: (nextTypeId: string) => Promise<void>
  onManualRefresh: () => void
}

export function ReviewPanel({
  document,
  documentTypes,
  availableTransitions,
  actionLoading = false,
  reclassifying = false,
  takingLonger = false,
  onFieldCommit,
  onTransition,
  onReclassify,
  onManualRefresh,
}: ReviewPanelProps) {
  const { t, i18n } = useTranslation()
  const documentType = documentTypes.find((type) => type.id === (document.aiClassification || document.documentTypeId))
  const uploaderName = document.uploaderUsername || '—'
  const isFormFill = !document.fileUrl

  return (
    <div className="flex h-full min-h-[620px] flex-col overflow-hidden rounded-md border border-border bg-surface shadow-sm">
      <div className="border-b border-border px-5 py-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <StatusBadge status={document.status} />
          <Badge variant="neutral">{documentType?.label || document.documentTypeId}</Badge>
        </div>
        <h1 className="text-lg font-semibold text-text-primary">{document.title || t('documentReview.titleFallback')}</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          {t('documentReview.header.uploadedBy', {
            name: uploaderName,
            time: formatRelativeTime(document.createdDate, i18n.language),
          })}
        </p>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 scrollbar-thin">
        {/* ── AI Summary ──────────────────────────────────── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.05em] text-text-tertiary">
              {t('documentReview.summary.title')}
            </h2>
            {isFormFill ? (
              <div className="flex items-center gap-2">
                <Badge variant="neutral">Form Submission</Badge>
                <span className="text-xs text-text-tertiary">No scan — fields reviewed</span>
              </div>
            ) : (
              <div className="flex flex-col items-end gap-0.5">
                <div className="flex items-center gap-2">
                  <ConfidenceBadge confidence={document.aiConfidenceScore} />
                  <span className="font-mono text-xs text-text-tertiary">
                    {t('documentReview.summary.confidence', { value: formatPercent(document.aiConfidenceScore) })}
                  </span>
                </div>
                <span className="text-[10px] text-text-tertiary">≥85% High · 60–84% Medium · &lt;60% Low</span>
              </div>
            )}
          </div>

          {/* Summary card — what the document contains */}
          <div className="rounded-md border border-border bg-canvas px-4 py-4">
            {document.aiSummary ? (
              <div className="border-l-4 border-brand-teal pl-4 text-sm leading-6 text-text-secondary">
                {document.aiSummary}
              </div>
            ) : document.aiReviewNotes ? (
              <div className="border-l-4 border-brand-teal pl-4 text-sm leading-6 text-text-secondary">
                {document.aiReviewNotes}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-text-tertiary">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t('documentReview.summary.aiProcessing', 'AI analysis in progress…')}</span>
              </div>
            )}
          </div>
        </section>

        {/* ── AI Review Notes ─────────────────────────────── */}
        {document.aiReviewNotes && document.aiSummary ? (
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                AI Review Notes
              </h2>
              <span title="Points flagged by the AI for staff to verify before approving">
                <Info className="h-3.5 w-3.5 text-text-tertiary" />
              </span>
            </div>
            <div className="rounded-md border border-warning bg-semantic-warning-bg px-4 py-3">
              <p className="whitespace-pre-line text-sm leading-6 text-semantic-warning">
                {document.aiReviewNotes}
              </p>
            </div>
            <p className="flex items-center gap-1 text-[11px] text-text-tertiary">
              <Info className="h-3 w-3 shrink-0" />
              These are AI suggestions — staff must verify each point before approving or returning the document.
            </p>
          </section>
        ) : null}

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.05em] text-text-tertiary">
            {t('documentReview.fields.title')}
          </h2>
          <ExtractedFieldsForm
            key={document.uniqueId}
            document={document}
            documentTypes={documentTypes}
            reclassifying={reclassifying}
            takingLonger={takingLonger}
            onFieldCommit={onFieldCommit}
            onReclassify={onReclassify}
            onManualRefresh={onManualRefresh}
          />
        </section>

        <Card className="border-border bg-canvas shadow-none">
          <CardHeader className="px-4 py-4">
            <CardTitle className="text-sm font-semibold uppercase tracking-[0.05em] text-text-tertiary">
              {t('documentReview.history.title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <HistoryTimeline transitions={document.transitions} />
          </CardContent>
        </Card>
      </div>

      <ReviewActionBar transitions={availableTransitions} loading={actionLoading} onSubmit={onTransition} />
    </div>
  )
}
