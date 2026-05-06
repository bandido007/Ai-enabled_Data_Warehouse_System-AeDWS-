import { Download, FileCheck2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDisplayDate } from '@/lib/utils'
import { useDocumentsQuery } from '@/lib/queries'

const DOC_TYPE_LABELS: Record<string, string> = {
  application_form: 'Application Form',
  inspection_form: 'Inspection Form',
  compliance_certificate: 'Compliance Certificate',
  warehouse_receipt: 'Warehouse Receipt',
}

export function DepositorDownloadsPage() {
  const { t, i18n } = useTranslation()
  const documentsQuery = useDocumentsQuery({ itemsPerPage: 50, status: 'APPROVED' }, true)
  const documents = documentsQuery.data?.data ?? []

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <Link to="/depositor" className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--brand-teal)' }}>← {t('depositorDownloads.back')}</Link>
        <h1 className="text-xl font-bold text-text-primary">{t('depositorDownloads.title')}</h1>
        <p className="text-sm text-text-secondary">All approved files are ready for download here.</p>
      </div>
      <div className="space-y-3">
        {documentsQuery.isLoading
          ? Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-20 rounded-2xl" />)
          : documents.length === 0
          ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-12 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: 'var(--success-bg)' }}>
                  <FileCheck2 className="h-7 w-7" style={{ color: 'var(--success)' }} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-text-primary">No approved downloads yet</p>
                  <p className="mt-0.5 text-xs text-text-tertiary">Approved files will appear here automatically.</p>
                </div>
              </div>
            )
          : documents.map((document) => (
              <div key={document.id} className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-4 shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>
                  <Download className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-text-primary">{document.title}</div>
                  <div className="mt-1 text-xs text-text-secondary">
                    {DOC_TYPE_LABELS[document.documentTypeId] ?? document.documentTypeId} · {formatDisplayDate(document.updatedDate, i18n.language)}
                  </div>
                </div>
                {document.fileUrl ? (
                  <Button asChild size="sm" variant="secondary">
                    <a href={document.fileUrl} target="_blank" rel="noreferrer">
                      <Download className="h-4 w-4" />
                      {t('depositorDownloads.download')}
                    </a>
                  </Button>
                ) : null}
              </div>
            ))}
      </div>
    </div>
  )
}
