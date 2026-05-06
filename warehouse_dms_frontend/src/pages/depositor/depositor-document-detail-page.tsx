import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  List,
  RotateCcw,
  User,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { MobileTransitionTimeline } from '@/components/depositor/mobile-transition-timeline'
import { StatusBadge } from '@/components/common/status-badge'
import { DocumentViewer } from '@/components/document-review/document-viewer'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDocumentQuery } from '@/lib/queries'
import { resolveFileUrl } from '@/lib/api'
import { cn, startCase } from '@/lib/utils'

/* ── Workflow progress stepper ── */
const WORKFLOW_STEPS = [
  { key: 'PENDING_STAFF',   label: 'Staff',    icon: User },
  { key: 'PENDING_MANAGER', label: 'Manager',  icon: User },
  { key: 'PENDING_CEO',     label: 'CEO',      icon: User },
  { key: 'APPROVED',        label: 'Approved', icon: CheckCircle2 },
] as const

const STATUS_STEP_MAP: Record<string, number> = {
  PENDING_STAFF:     0,
  PENDING_MANAGER:   1,
  PENDING_CEO:       2,
  APPROVED:          3,
  CORRECTION_NEEDED: 0,
  REJECTED:          -1,
}

const STATUS_MESSAGE: Record<string, { title: string; body: string; color: string }> = {
  PENDING_STAFF:    { title: 'With Staff',    body: 'Your document is waiting for staff review.',                  color: 'text-amber-700 bg-amber-50 border-amber-200' },
  PENDING_MANAGER:  { title: 'With Manager',  body: 'Staff approved it. Awaiting manager review.',                 color: 'text-sky-700 bg-sky-50 border-sky-200' },
  PENDING_CEO:      { title: 'With CEO',      body: 'Manager review done. Awaiting final CEO approval.',          color: 'text-violet-700 bg-violet-50 border-violet-200' },
  APPROVED:         { title: 'Approved ✓',    body: 'This document has been fully approved and is on record.',    color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  CORRECTION_NEEDED:{ title: 'Needs Changes', body: 'A reviewer requested changes before this can move forward.', color: 'text-red-700 bg-red-50 border-red-200' },
  REJECTED:         { title: 'Rejected',      body: 'This document was rejected.',                                color: 'text-red-700 bg-red-50 border-red-200' },
}

function WorkflowStepper({ status }: { status: string }) {
  const activeIdx    = STATUS_STEP_MAP[status] ?? 0
  const isCorrection = status === 'CORRECTION_NEEDED'
  const isRejected   = status === 'REJECTED'

  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-4">
      <div className="mb-3 text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
        Approval pathway
      </div>
      <div className="flex items-center">
        {WORKFLOW_STEPS.map((step, idx) => {
          const done   = !isCorrection && !isRejected && idx < activeIdx
          const active = !isCorrection && !isRejected && idx === activeIdx
          const Icon   = step.icon
          const isLast = idx === WORKFLOW_STEPS.length - 1

          return (
            <div key={step.key} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all',
                    done   ? 'border-brand-teal bg-brand-teal text-white'
                    : active ? 'border-brand-teal bg-brand-teal/10 text-brand-teal'
                    : 'border-border bg-canvas text-text-tertiary'
                  )}
                >
                  {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-3.5 w-3.5" />}
                </div>
                <span
                  className={cn(
                    'max-w-[52px] text-center text-[9px] font-semibold leading-tight',
                    done || active ? 'text-brand-teal' : 'text-text-tertiary'
                  )}
                >
                  {step.label}
                </span>
              </div>
              {!isLast && (
                <div
                  className={cn(
                    'mx-1 mb-5 h-[2px] flex-1 rounded-full transition-all',
                    done ? 'bg-brand-teal' : 'bg-border'
                  )}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border-subtle py-2.5 last:border-b-0">
      <span className="shrink-0 text-xs text-text-tertiary">{label}</span>
      <span className="text-right text-xs font-semibold text-text-primary">{value}</span>
    </div>
  )
}

const DOC_TYPE_LABELS: Record<string, string> = {
  application_form:                    'Form No 1 — License Application',
  inspection_form:                     'Form No 9 — Inspector License',
  compliance_certificate:              'Form No 2 — Compliance Certificate',
  warehouse_receipt:                   'Warehouse Receipt',
  depositor_registration:              'Form No 4 — Depositor Registration',
  quality_certificate_form:            'Form No 3 — Quality Certificate',
  warehouse_receipt_delivery_report:   'Form No 6 — Delivery Report',
  commodity_parameter_acknowledgement: 'Form No 13 — Quality Acknowledgement',
  notice_of_withholding:               'Notice No 6 — Withholding Notice',
  commodity_misdelivery:               'Form No 7 — Mis-Delivery Claim',
  notice_of_deteriorating_goods:       'Notice No 2 — Deteriorating Goods',
}

type DocumentData = NonNullable<ReturnType<typeof useDocumentQuery>['data']>

function DetailPanel({ document: doc }: { document: DocumentData }) {
  const { t } = useTranslation()

  const formattedDate = new Date(doc.createdDate).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  const statusInfo = STATUS_MESSAGE[doc.status] ?? {
    title: startCase(doc.status),
    body: 'Track the latest review updates here.',
    color: 'text-text-secondary bg-canvas border-border',
  }

  return (
    <div className="space-y-4">
      {/* Status banner */}
      <div className={cn('rounded-2xl border px-4 py-3', statusInfo.color)}>
        <div className="text-sm font-bold">{statusInfo.title}</div>
        <div className="mt-0.5 text-xs leading-5">{statusInfo.body}</div>
      </div>

      {/* Workflow stepper */}
      {doc.status !== 'REJECTED' && <WorkflowStepper status={doc.status} />}

      {/* Correction notice */}
      {doc.status === 'CORRECTION_NEEDED' && (
        <div className="space-y-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
            <span className="text-sm font-bold text-red-700">{t('depositorDetail.correctionTitle')}</span>
          </div>
          <p className="text-sm leading-relaxed text-red-700">
            {doc.currentCorrectionNote || t('depositorDetail.noCorrectionNote')}
          </p>
          <Button asChild className="w-full">
            <Link to={doc.fileUrl ? '/depositor/upload' : `/depositor/documents/${doc.id}/correct`}>
              <RotateCcw className="h-4 w-4" />
              {t('depositorDetail.resubmit')}
            </Link>
          </Button>
        </div>
      )}

      {/* Document metadata */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="flex items-center gap-3 border-b border-border bg-canvas px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-info-bg">
            <FileText className="h-5 w-5 text-brand-teal" />
          </div>
          <div className="text-sm font-semibold text-text-primary">Document Details</div>
        </div>
        <div className="px-4 pb-1 pt-0">
          <MetaRow label="Document ID" value={`#${doc.id}`} />
          <MetaRow label="Form type" value={DOC_TYPE_LABELS[doc.documentTypeId] ?? doc.documentTypeId} />
          <MetaRow label="Warehouse" value={doc.warehouseName} />
          <MetaRow label="Uploaded by" value={doc.uploaderUsername} />
          <MetaRow label="Submitted" value={formattedDate} />
          <MetaRow
            label="Status"
            value={
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3 w-3" />
                <StatusBadge status={doc.status} />
              </span>
            }
          />
          {doc.aiConfidenceScore !== null && doc.aiConfidenceScore !== undefined && (
            <MetaRow
              label="AI confidence"
              value={
                <span className={cn(
                  'rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold',
                  doc.aiConfidenceScore >= 0.90 ? 'bg-emerald-100 text-emerald-700'
                  : doc.aiConfidenceScore >= 0.75 ? 'bg-amber-100 text-amber-700'
                  : 'bg-red-100 text-red-700'
                )}>
                  {Math.round(doc.aiConfidenceScore * 100)}%
                </span>
              }
            />
          )}
        </div>
      </div>

      {/* AI review notes */}
      {(doc.aiReviewNotes || doc.aiSummary) && (
        <div className="rounded-2xl border border-border bg-surface px-4 py-4">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
            AI Review Notes
          </div>
          <p className="text-xs leading-5 text-text-secondary">
            {doc.aiReviewNotes || doc.aiSummary}
          </p>
        </div>
      )}

      {/* Audit timeline */}
      {doc.transitions.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
            {t('depositorDetail.timeline')}
          </h2>
          <MobileTransitionTimeline transitions={doc.transitions} />
        </div>
      )}

      {/* Bottom actions */}
      <div className="flex gap-2 pb-6">
        {doc.status === 'CORRECTION_NEEDED' ? (
          <Button asChild className="flex-1 gap-2">
            <Link to={doc.fileUrl ? '/depositor/upload' : `/depositor/documents/${doc.id}/correct`}>
              <RotateCcw className="h-4 w-4" />
              {doc.fileUrl ? 'Resubmit document' : 'Correct & Resubmit'}
            </Link>
          </Button>
        ) : doc.status === 'APPROVED' && doc.fileUrl ? (
          <Button asChild className="flex-1 gap-2">
            <a href={resolveFileUrl(doc.fileUrl) ?? '#'} target="_blank" rel="noreferrer">
              <Download className="h-4 w-4" />
              Download approved file
            </a>
          </Button>
        ) : (
          <Button asChild className="flex-1 gap-2" variant="secondary">
            <Link to="/depositor/documents">
              <List className="h-4 w-4" />
              Back to all documents
            </Link>
          </Button>
        )}
      </div>
    </div>
  )
}

/* ── Page root ── */
export function DepositorDocumentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { t } = useTranslation()
  const documentQuery = useDocumentQuery(id, Boolean(id), true)
  const document = documentQuery.data

  if (documentQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-24 rounded-lg" />
        <div className="hidden gap-5 lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(340px,2fr)]">
          <Skeleton className="h-[760px] rounded-2xl" />
          <Skeleton className="h-[760px] rounded-2xl" />
        </div>
        <div className="space-y-4 lg:hidden">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-[400px] rounded-2xl" />
        </div>
      </div>
    )
  }

  if (!document) {
    return (
      <div className="rounded-2xl border border-semantic-error bg-semantic-error/10 px-5 py-6 text-sm text-semantic-error">
        {t('depositorDetail.loadError')}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Back + title row */}
      <div>
        <Link
          to="/depositor/documents"
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-teal hover:underline"
        >
          ← {t('depositorDetail.back')}
        </Link>
        <div className="mt-2 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-text-primary">{document.title}</h1>
            <p className="mt-0.5 text-xs text-text-tertiary">
              {DOC_TYPE_LABELS[document.documentTypeId] ?? document.documentTypeId}
            </p>
          </div>
          <div className="shrink-0">
            <StatusBadge status={document.status} />
          </div>
        </div>
      </div>

      {/* ── Desktop: two-column (preview | details) ── */}
      <div className="hidden gap-5 lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(340px,2fr)]">
        <DocumentViewer fileUrl={document.fileUrl} formFields={document.aiExtractedFields as Record<string, string>} />
        <div className="max-h-[calc(100vh-120px)] overflow-y-auto pr-1">
          <DetailPanel document={document} />
        </div>
      </div>

      {/* ── Mobile/tablet: tabs ── */}
      <div className="lg:hidden">
        <Tabs defaultValue="preview" className="space-y-4">
          <TabsList className="grid h-auto w-full grid-cols-2">
            <TabsTrigger value="preview">Document Preview</TabsTrigger>
            <TabsTrigger value="details">Status &amp; Details</TabsTrigger>
          </TabsList>
          <TabsContent value="preview">
            <DocumentViewer fileUrl={document.fileUrl} formFields={document.aiExtractedFields as Record<string, string>} />
          </TabsContent>
          <TabsContent value="details">
            <DetailPanel document={document} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
