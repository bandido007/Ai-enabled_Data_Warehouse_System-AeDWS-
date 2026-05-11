import { FileText } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'

import { EmptyState } from '@/components/common/empty-state'
import { PageHeader } from '@/components/common/page-header'
import { DocumentViewer } from '@/components/document-review/document-viewer'
import { HistoryTimeline } from '@/components/document-review/history-timeline'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useDocumentQuery } from '@/lib/queries'
import { getExtractedFieldEntries } from '@/lib/document-review'

export function RegulatorDocumentViewPage() {
  const { id } = useParams<{ id: string }>()
  const { t } = useTranslation()
  const documentQuery = useDocumentQuery(id, Boolean(id))
  const document = documentQuery.data

  if (documentQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 rounded-md" />
        <div className="hidden gap-5 lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(360px,2fr)]">
          <Skeleton className="h-[760px] rounded-md" />
          <Skeleton className="h-[760px] rounded-md" />
        </div>
      </div>
    )
  }

  if (!document) {
    return <div className="rounded-md border border-semantic-error bg-semantic-error-bg px-4 py-6 text-sm text-semantic-error">{t('regulator.readOnly.loadError')}</div>
  }

  const fields = getExtractedFieldEntries(document.aiExtractedFields)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title={document.title || t('regulator.readOnly.title')} subtitle={document.warehouseName} />

      <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(360px,2fr)]">
        <DocumentViewer fileUrl={document.fileUrl} />
        <div className="space-y-4 lg:min-h-0 lg:overflow-y-auto lg:pr-1 lg:scrollbar-thin">
          <Card>
            <CardHeader className="border-b border-border px-5 py-4">
              <CardTitle>{t('regulator.readOnly.summary')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 px-5 py-4">
              <p className="text-sm leading-6 text-text-secondary">{document.aiSummary || document.aiReviewNotes || '—'}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-border px-5 py-4">
              <CardTitle>{t('regulator.readOnly.fields')}</CardTitle>
            </CardHeader>
            <CardContent className="px-5 py-4">
              {fields.length ? (
                <div className="space-y-3">
                  {fields.map((field) => (
                    <div key={field.key} className="rounded-md border border-border-subtle px-4 py-3">
                      <div className="text-xs font-mono uppercase tracking-[0.05em] text-text-tertiary">{field.label}</div>
                      <div className="mt-1 text-sm text-text-primary">{field.value || '—'}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon={<FileText className="h-6 w-6" />} title={t('regulator.readOnly.fields')} description={t('documentReview.fields.empty')} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-border px-5 py-4">
              <CardTitle>{t('regulator.readOnly.history')}</CardTitle>
            </CardHeader>
            <CardContent className="px-5 py-4">
              <HistoryTimeline transitions={document.transitions} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
