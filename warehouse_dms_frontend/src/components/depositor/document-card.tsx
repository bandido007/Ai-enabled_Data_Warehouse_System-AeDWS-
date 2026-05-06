import { AlertTriangle, ArrowRight, FileText } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/common/status-badge'
import type { DocumentRecord } from '@/types/api'
import { formatRelativeTime } from '@/lib/utils'

const DOC_TYPE_LABELS: Record<string, string> = {
  application_form:       'Application Form',
  inspection_form:        'Inspection Form',
  compliance_certificate: 'Compliance Certificate',
  warehouse_receipt:      'Warehouse Receipt',
}

const STATUS_BORDER_COLOR: Record<string, string> = {
  PENDING_STAFF:    'var(--warning)',
  PENDING_MANAGER:  'var(--warning)',
  PENDING_CEO:      'var(--warning)',
  APPROVED:         'var(--success)',
  REJECTED:         'var(--error)',
  CORRECTION_NEEDED:'var(--error)',
}

const STATUS_ICON_BG: Record<string, string> = {
  PENDING_STAFF:    'var(--warning-bg)',
  PENDING_MANAGER:  'var(--warning-bg)',
  PENDING_CEO:      'var(--warning-bg)',
  APPROVED:         'var(--success-bg)',
  REJECTED:         'var(--error-bg)',
  CORRECTION_NEEDED:'var(--error-bg)',
}

const STATUS_ICON_COLOR: Record<string, string> = {
  PENDING_STAFF:    'var(--warning)',
  PENDING_MANAGER:  'var(--warning)',
  PENDING_CEO:      'var(--warning)',
  APPROVED:         'var(--success)',
  REJECTED:         'var(--error)',
  CORRECTION_NEEDED:'var(--error)',
}

function getDocumentHint(status: string) {
  if (status === 'CORRECTION_NEEDED') return 'Open to review the correction note and resubmit.'
  if (status === 'APPROVED') return 'Ready to view or download.'
  if (status === 'PENDING_MANAGER') return 'With manager for review.'
  if (status === 'PENDING_CEO') return 'Awaiting final approval.'
  return 'Currently being reviewed by staff.'
}

export function DepositorDocumentCard({ document }: { document: DocumentRecord }) {
  const { i18n } = useTranslation()
  const borderColor = STATUS_BORDER_COLOR[document.status] ?? 'var(--border)'
  const iconBg      = STATUS_ICON_BG[document.status]      ?? 'var(--info-bg)'
  const iconColor   = STATUS_ICON_COLOR[document.status]   ?? 'var(--brand-teal)'
  const typeLabel   = DOC_TYPE_LABELS[document.documentTypeId] ?? document.documentTypeId
  const needsAction = document.status === 'CORRECTION_NEEDED'

  return (
    <Link
      to={`/depositor/documents/${document.id}`}
      className="block overflow-hidden rounded-2xl border border-border bg-surface px-4 py-3.5 shadow-sm transition-all active:scale-[0.98] hover:shadow-md"
      style={{ borderLeftWidth: '3px', borderLeftColor: borderColor }}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl" style={{ background: iconBg }}>
          {needsAction ? <AlertTriangle className="h-5 w-5" style={{ color: iconColor }} /> : <FileText className="h-5 w-5" style={{ color: iconColor }} />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-text-primary">{document.title}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-text-tertiary">
                <span className="truncate">{typeLabel}</span>
                <span>·</span>
                <span className="whitespace-nowrap">{formatRelativeTime(document.updatedDate, i18n.language)}</span>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <StatusBadge status={document.status} />
              <ArrowRight className="h-3.5 w-3.5 text-text-tertiary" />
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="line-clamp-1 text-xs text-text-secondary">{getDocumentHint(document.status)}</p>
            {needsAction && (
              <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: 'var(--error-bg)', color: 'var(--error)' }}>
                Action needed
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}
