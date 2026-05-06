import { AlertTriangle, ArrowRight, BellRing, CheckCircle2, ChevronRight, Clock, FileText, Upload } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { DepositorDocumentCard } from '@/components/depositor/document-card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/use-auth'
import { useDocumentsQuery, useNotificationsQuery } from '@/lib/queries'
import { formatRelativeTime } from '@/lib/utils'

function getTimeGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function getNextStep(status: string) {
  if (status === 'CORRECTION_NEEDED') return 'Review the note and resubmit your document.'
  if (status === 'PENDING_STAFF') return 'Waiting for staff review.'
  if (status === 'PENDING_MANAGER') return 'Waiting for manager approval.'
  if (status === 'PENDING_CEO') return 'Waiting for CEO sign-off.'
  if (status === 'APPROVED') return 'Approved and ready for download.'
  return 'Track progress from your documents page.'
}

function getTimeTone(status: string) {
  if (status === 'CORRECTION_NEEDED') return { bg: 'var(--error-bg)', color: 'var(--error)' }
  if (status === 'APPROVED') return { bg: 'var(--success-bg)', color: 'var(--success)' }
  return { bg: 'var(--warning-bg)', color: 'var(--warning)' }
}

function StatPill({ icon, label, value, color, bg }: { icon: React.ReactNode; label: string; value: number | string; color: string; bg: string }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1.5 rounded-2xl px-3 py-4 text-center" style={{ background: bg }}>
      <div style={{ color }}>{icon}</div>
      <div className="text-xl font-bold" style={{ color }}>{value}</div>
      <div className="text-[10px] font-medium leading-tight text-text-secondary">{label}</div>
    </div>
  )
}

export function DepositorHomePage() {
  const { t, i18n } = useTranslation()
  const { profile } = useAuth()
  const documentsQuery = useDocumentsQuery({ itemsPerPage: 50 }, true)
  const notificationsQuery = useNotificationsQuery(true)
  const documents = documentsQuery.data?.data ?? []
  const notifications = notificationsQuery.data ?? []

  const totalCount = documents.length
  const approvedCount = documents.filter((d) => d.status === 'APPROVED').length
  const pendingCount = documents.filter((d) => d.status !== 'APPROVED').length
  const correctionCount = documents.filter((d) => d.status === 'CORRECTION_NEEDED').length
  const greeting = getTimeGreeting()
  const name = profile?.firstName || profile?.username || 'Depositor'
  const attentionDocs = documents
    .filter((d) => d.status === 'CORRECTION_NEEDED' || d.status.startsWith('PENDING_'))
    .sort((a, b) => (a.status === 'CORRECTION_NEEDED' ? 0 : 1) - (b.status === 'CORRECTION_NEEDED' ? 0 : 1))
    .slice(0, 3)
  const recentDocs = documents.slice(0, 4)
  const activityItems = notifications.slice(0, 3)

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-text-primary">{greeting}, {name} 👋</h1>
        <p className="text-sm text-text-secondary">
          {correctionCount > 0
            ? `You have ${correctionCount} document${correctionCount !== 1 ? 's' : ''} that need your attention.`
            : pendingCount > 0
            ? `You have ${pendingCount} document${pendingCount !== 1 ? 's' : ''} moving through review.`
            : 'Everything is up to date and ready.'}
        </p>
      </div>

      <div className="flex gap-3">
        {documentsQuery.isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 flex-1 rounded-2xl" />)
        ) : (
          <>
            <StatPill icon={<FileText className="h-5 w-5" />} label="Total" value={totalCount} color="var(--brand-teal)" bg="var(--info-bg)" />
            <StatPill icon={<Clock className="h-5 w-5" />} label="In review" value={pendingCount} color="var(--warning)" bg="var(--warning-bg)" />
            <StatPill icon={<CheckCircle2 className="h-5 w-5" />} label="Approved" value={approvedCount} color="var(--success)" bg="var(--success-bg)" />
          </>
        )}
      </div>

      <Link to="/depositor/upload" className="group block overflow-hidden rounded-2xl text-white shadow-md transition-all active:scale-[0.98]" style={{ background: 'linear-gradient(135deg, var(--brand-teal) 0%, #0b57d0 100%)' }}>
        <div className="flex items-center gap-4 px-5 py-5">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-white/15">
            <Upload className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <div className="text-base font-bold">{t('depositorHome.uploadTitle')}</div>
            <div className="mt-0.5 text-sm text-white/80">{t('depositorHome.uploadSubtitle')}</div>
          </div>
          <ArrowRight className="h-5 w-5 text-white/70 transition-transform group-hover:translate-x-1" />
        </div>
      </Link>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-text-tertiary">Required forms checklist</h2>
          <Link to="/depositor/upload" className="text-xs font-semibold" style={{ color: 'var(--brand-teal)' }}>Upload a form</Link>
        </div>
        <div className="rounded-2xl border border-border bg-surface shadow-sm divide-y divide-border overflow-hidden">
          {[
            {
              formNo: 'Form No 4',
              title: 'Depositor Registration & Declaration',
              desc: 'Register as a depositor with TWLB. Required before any commodity can be deposited.',
              docTypeId: 'depositor_registration',
              required: true,
            },
            {
              formNo: 'Form No 3',
              title: 'Quality Certificate',
              desc: 'Quality assessment per commodity batch — moisture, infestation, admixtures.',
              docTypeId: 'quality_certificate_form',
              required: true,
            },
            {
              formNo: 'Form No 6',
              title: 'Warehouse Receipt Delivery Report',
              desc: 'Confirms delivery of goods; sent to TWLB and depositor/buyer.',
              docTypeId: 'warehouse_receipt_delivery_report',
              required: true,
            },
            {
              formNo: 'Form No 13',
              title: 'Commodity Parameter Acknowledgement',
              desc: 'Buyer signs to accept received commodity quality and grade.',
              docTypeId: 'commodity_parameter_acknowledgement',
              required: false,
            },
            {
              formNo: 'Form No 1',
              title: 'Warehouse Operator Application (for operators)',
              desc: 'Warehouse Operator License application submitted to TWLB.',
              docTypeId: 'application_form',
              required: false,
            },
          ].map(({ formNo, title, desc, docTypeId, required }) => {
            const uploaded = documents.some((d) => d.documentTypeId === docTypeId)
            return (
              <Link
                key={docTypeId}
                to={uploaded ? '/depositor/documents' : '/depositor/upload'}
                className="flex items-start gap-3 px-4 py-3.5 hover:bg-canvas transition-colors"
              >
                <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold ${uploaded ? 'bg-green-100 text-green-700' : required ? 'bg-amber-50 text-amber-600' : 'bg-canvas text-text-tertiary'}`}>
                  {uploaded ? '✓' : required ? '!' : '·'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-text-tertiary">{formNo}</span>
                    {required && !uploaded && (
                      <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-600">Required</span>
                    )}
                    {uploaded && (
                      <span className="rounded-full bg-green-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-green-600">Uploaded</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm font-semibold text-text-primary">{title}</p>
                  <p className="mt-0.5 text-xs text-text-secondary">{desc}</p>
                </div>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-text-tertiary" />
              </Link>
            )
          })}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-text-tertiary">Needs attention</h2>
          <Link to="/depositor/documents?filter=correction" className="text-xs font-semibold" style={{ color: 'var(--brand-teal)' }}>View all</Link>
        </div>
        {documentsQuery.isLoading ? (
          Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)
        ) : attentionDocs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full" style={{ background: 'var(--success-bg)' }}>
              <CheckCircle2 className="h-6 w-6" style={{ color: 'var(--success)' }} />
            </div>
            <p className="mt-3 text-sm font-semibold text-text-primary">Nothing urgent right now</p>
            <p className="mt-1 text-xs text-text-tertiary">We will show items here whenever you need to act.</p>
          </div>
        ) : (
          attentionDocs.map((document) => {
            const tone = getTimeTone(document.status)
            return (
              <Link key={document.id} to={`/depositor/documents/${document.id}`} className="block rounded-2xl border px-4 py-4 shadow-sm transition-all hover:shadow-md" style={{ borderColor: document.status === 'CORRECTION_NEEDED' ? 'var(--error)' : 'var(--border)' }}>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: tone.bg, color: tone.color }}>
                    {document.status === 'CORRECTION_NEEDED' ? <AlertTriangle className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-text-primary">{document.title}</p>
                      <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: tone.bg, color: tone.color }}>
                        {document.status === 'CORRECTION_NEEDED' ? 'Action needed' : 'In review'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-text-secondary">{getNextStep(document.status)}</p>
                    <p className="mt-2 text-[11px] text-text-tertiary">Updated {formatRelativeTime(document.updatedDate, i18n.language)}</p>
                  </div>
                </div>
              </Link>
            )
          })
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-text-tertiary">Recent activity</h2>
          <Link to="/depositor/documents" className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--brand-teal)' }}>
            {t('depositorHome.seeAll')}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="space-y-3">
          {notificationsQuery.isLoading ? (
            Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-16 rounded-2xl" />)
          ) : activityItems.length > 0 ? (
            activityItems.map((item) => (
              <div key={item.id} className="flex items-start gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-sm">
                <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: 'var(--info-bg)', color: 'var(--brand-teal)' }}>
                  <BellRing className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-text-primary">{item.subject}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-text-secondary">{item.body}</p>
                  <p className="mt-1 text-[11px] text-text-tertiary">{formatRelativeTime(item.createdDate, i18n.language)}</p>
                </div>
              </div>
            ))
          ) : recentDocs.length > 0 ? (
            recentDocs.map((document) => (
              <div key={document.id} className="flex items-start gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-sm">
                <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: 'var(--info-bg)', color: 'var(--brand-teal)' }}>
                  <FileText className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-text-primary">{document.title}</p>
                  <p className="mt-0.5 text-xs text-text-secondary">{getNextStep(document.status)}</p>
                  <p className="mt-1 text-[11px] text-text-tertiary">{formatRelativeTime(document.updatedDate, i18n.language)}</p>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center">
              <p className="text-sm font-semibold text-text-primary">No activity yet</p>
              <p className="mt-1 text-xs text-text-tertiary">New uploads and review updates will appear here.</p>
            </div>
          )}
        </div>
      </section>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wider text-text-tertiary">Recent documents</h2>
        <Link to="/depositor/documents" className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--brand-teal)' }}>
          Browse all
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="space-y-3">
        {documentsQuery.isLoading ? (
          Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-[72px] rounded-2xl" />)
        ) : recentDocs.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: 'var(--info-bg)' }}>
              <FileText className="h-7 w-7" style={{ color: 'var(--brand-teal)' }} />
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary">No documents yet</p>
              <p className="mt-0.5 text-xs text-text-tertiary">Upload your first document to get started</p>
            </div>
          </div>
        ) : (
          recentDocs.map((document) => <DepositorDocumentCard key={document.id} document={document} />)
        )}
      </div>
    </div>
  )
}
