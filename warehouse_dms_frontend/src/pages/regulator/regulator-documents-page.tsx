import { useMemo, useState } from 'react'
import { FileSearch } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { ConfidenceBadge } from '@/components/common/confidence-badge'
import { EmptyState } from '@/components/common/empty-state'
import { PageHeader } from '@/components/common/page-header'
import { StatusBadge } from '@/components/common/status-badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatShortDate } from '@/lib/utils'
import { useDocumentsQuery, useDocumentTypesQuery, useWarehousesQuery } from '@/lib/queries'

export function RegulatorDocumentsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [status, setStatus] = useState('all')
  const [documentTypeId, setDocumentTypeId] = useState('all')
  const [warehouseId, setWarehouseId] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')

  const params = useMemo(
    () => ({
      itemsPerPage: 20,
      status: status !== 'all' ? status : undefined,
      documentTypeId: documentTypeId !== 'all' ? documentTypeId : undefined,
      warehouseId: warehouseId !== 'all' ? Number(warehouseId) : undefined,
      searchTerm: searchTerm || undefined,
    }),
    [documentTypeId, searchTerm, status, warehouseId]
  )

  const documentsQuery = useDocumentsQuery(params, true)
  const warehousesQuery = useWarehousesQuery(true)
  const typesQuery = useDocumentTypesQuery(true)
  const documents = documentsQuery.data?.data ?? []
  const warehouses = warehousesQuery.data ?? []
  const types = typesQuery.data ?? []

  return (
    <div className="space-y-6">
      <PageHeader title={t('regulator.documents.title')} subtitle={t('regulator.documents.subtitle')} />

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
          <Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder={t('documents.filters.search')} />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue placeholder={t('documents.filters.status')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('documents.filters.all')}</SelectItem>
              <SelectItem value="APPROVED">{t('status.APPROVED')}</SelectItem>
              <SelectItem value="PENDING_STAFF">{t('status.PENDING_STAFF')}</SelectItem>
              <SelectItem value="REJECTED">{t('status.REJECTED')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={documentTypeId} onValueChange={setDocumentTypeId}>
            <SelectTrigger>
              <SelectValue placeholder={t('documents.filters.type')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('documents.filters.all')}</SelectItem>
              {types.map((type) => (
                <SelectItem key={type.id} value={type.id}>{type.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={warehouseId} onValueChange={setWarehouseId}>
            <SelectTrigger>
              <SelectValue placeholder={t('documents.filters.warehouse')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('documents.filters.all')}</SelectItem>
              {warehouses.map((warehouse) => (
                <SelectItem key={warehouse.id} value={String(warehouse.id)}>{warehouse.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

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
                  <TableHead>{t('documents.table.columns.id')}</TableHead>
                  <TableHead>{t('documents.table.columns.document')}</TableHead>
                  <TableHead>{t('documents.table.columns.type')}</TableHead>
                  <TableHead>{t('documents.table.columns.warehouse')}</TableHead>
                  <TableHead>{t('documents.table.columns.confidence')}</TableHead>
                  <TableHead>{t('documents.table.columns.status')}</TableHead>
                  <TableHead>{t('documents.table.columns.submitted')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((document) => (
                  <TableRow key={document.id} className="cursor-pointer" onClick={() => navigate(`/regulator/documents/${document.id}`)}>
                    <TableCell className="font-mono text-xs text-text-tertiary">{String(document.id).padStart(6, '0')}</TableCell>
                    <TableCell>
                      <div className="font-medium text-text-primary">{document.title}</div>
                      <div className="mt-0.5 text-xs text-text-tertiary">{document.aiSummary || document.aiReviewNotes || '—'}</div>
                    </TableCell>
                    <TableCell>{document.documentTypeId}</TableCell>
                    <TableCell>{document.warehouseName}</TableCell>
                    <TableCell><ConfidenceBadge confidence={document.aiConfidenceScore} /></TableCell>
                    <TableCell><StatusBadge status={document.status} /></TableCell>
                    <TableCell className="font-mono text-xs text-text-tertiary">{formatShortDate(document.createdDate)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="p-4">
              <EmptyState icon={<FileSearch className="h-6 w-6" />} title={t('regulator.documents.empty.title')} description={t('regulator.documents.empty.description')} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
