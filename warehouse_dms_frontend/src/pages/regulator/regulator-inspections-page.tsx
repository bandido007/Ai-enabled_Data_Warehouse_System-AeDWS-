import { ClipboardList } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { EmptyState } from '@/components/common/empty-state'
import { PageHeader } from '@/components/common/page-header'
import { StatusBadge } from '@/components/common/status-badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { normalizeFieldValue } from '@/lib/document-review'
import { useDocumentsQuery } from '@/lib/queries'
import { formatShortDate } from '@/lib/utils'

export function RegulatorInspectionsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const documentsQuery = useDocumentsQuery({ itemsPerPage: 20, documentTypeId: 'inspection_form' }, true)
  const documents = documentsQuery.data?.data ?? []

  return (
    <div className="space-y-6">
      <PageHeader title={t('regulator.inspections.title')} subtitle={t('regulator.inspections.subtitle')} />

      <Card>
        <CardContent className="p-0">
          {documentsQuery.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-14 rounded-none" />)}
            </div>
          ) : documents.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('documents.table.columns.document')}</TableHead>
                  <TableHead>{t('regulator.inspections.columns.warehouse')}</TableHead>
                  <TableHead>{t('regulator.inspections.columns.date')}</TableHead>
                  <TableHead>{t('regulator.inspections.columns.inspector')}</TableHead>
                  <TableHead>{t('regulator.inspections.columns.summary')}</TableHead>
                  <TableHead>{t('documents.table.columns.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((document) => (
                  <TableRow key={document.id} className="cursor-pointer" onClick={() => navigate(`/regulator/documents/${document.id}`)}>
                    <TableCell>
                      <div className="font-medium text-text-primary">{document.title}</div>
                      <div className="mt-0.5 text-xs text-text-tertiary">{formatShortDate(document.createdDate)}</div>
                    </TableCell>
                    <TableCell>{normalizeFieldValue(document.aiExtractedFields.warehouse || document.warehouseName)}</TableCell>
                    <TableCell>{normalizeFieldValue(document.aiExtractedFields.inspection_date || document.aiExtractedFields.inspectionDate)}</TableCell>
                    <TableCell>{normalizeFieldValue(document.aiExtractedFields.inspector || document.aiExtractedFields.inspector_name)}</TableCell>
                    <TableCell className="max-w-[320px] truncate">{normalizeFieldValue(document.aiExtractedFields.findings_summary || document.aiSummary)}</TableCell>
                    <TableCell><StatusBadge status={document.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="p-4">
              <EmptyState icon={<ClipboardList className="h-6 w-6" />} title={t('regulator.inspections.title')} description={t('regulator.documents.empty.description')} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
