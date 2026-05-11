import { useMemo, useState } from 'react'
import { FileSearch } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { ConfidenceBadge } from '@/components/common/confidence-badge'
import { EmptyState } from '@/components/common/empty-state'
import { PageHeader } from '@/components/common/page-header'
import { StatusBadge } from '@/components/common/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  ALL_DOCUMENT_CATEGORIES,
  getDocumentTypeCategories,
  getDocumentTypesForCategory,
} from '@/lib/document-types'
import { formatShortDate } from '@/lib/utils'
import { useDocumentsQuery, useDocumentTypesQuery, useWarehousesQuery } from '@/lib/queries'

export function RegulatorDocumentsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [pageNumber, setPageNumber] = useState(1)
  const [status, setStatus] = useState('all')
  const [documentCategory, setDocumentCategory] = useState(ALL_DOCUMENT_CATEGORIES)
  const [documentTypeId, setDocumentTypeId] = useState('all')
  const [warehouseId, setWarehouseId] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const params = useMemo(
    () => ({
      itemsPerPage: 20,
      pageNumber,
      status: status !== 'all' ? status : undefined,
      documentCategory: documentCategory !== ALL_DOCUMENT_CATEGORIES ? documentCategory : undefined,
      documentTypeId: documentTypeId !== 'all' ? documentTypeId : undefined,
      warehouseId: warehouseId !== 'all' ? Number(warehouseId) : undefined,
      searchTerm: searchTerm || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    }),
    [documentCategory, documentTypeId, endDate, pageNumber, searchTerm, startDate, status, warehouseId]
  )

  const documentsQuery = useDocumentsQuery(params, true)
  const warehousesQuery = useWarehousesQuery(true)
  const typesQuery = useDocumentTypesQuery(true)
  const documents = documentsQuery.data?.data ?? []
  const page = documentsQuery.data?.page
  const warehouses = warehousesQuery.data ?? []
  const types = useMemo(() => typesQuery.data ?? [], [typesQuery.data])
  const documentCategories = useMemo(() => getDocumentTypeCategories(types), [types])
  const filteredTypes = useMemo(
    () => getDocumentTypesForCategory(types, documentCategory),
    [documentCategory, types]
  )

  return (
    <div className="space-y-6">
      <PageHeader title={t('regulator.documents.title')} subtitle={t('regulator.documents.subtitle')} />

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-7">
          <Input value={searchTerm} onChange={(event) => { setPageNumber(1); setSearchTerm(event.target.value) }} placeholder={t('documents.filters.search')} className="xl:col-span-2" />
          <Select value={status} onValueChange={(value) => { setPageNumber(1); setStatus(value) }}>
            <SelectTrigger>
              <SelectValue placeholder={t('documents.filters.status')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="APPROVED">{t('status.APPROVED')}</SelectItem>
              <SelectItem value="PENDING_STAFF">{t('status.PENDING_STAFF')}</SelectItem>
              <SelectItem value="REJECTED">{t('status.REJECTED')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={documentCategory} onValueChange={(value) => { setPageNumber(1); setDocumentCategory(value); setDocumentTypeId('all') }}>
            <SelectTrigger>
              <SelectValue placeholder="Document category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_DOCUMENT_CATEGORIES}>All document categories</SelectItem>
              {documentCategories.map((category) => (
                <SelectItem key={category} value={category}>{category}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={documentTypeId} onValueChange={(value) => { setPageNumber(1); setDocumentTypeId(value) }}>
            <SelectTrigger>
              <SelectValue placeholder={t('documents.filters.type')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {documentCategory === ALL_DOCUMENT_CATEGORIES ? 'All document types' : `All ${documentCategory} types`}
              </SelectItem>
              {filteredTypes.map((type) => (
                <SelectItem key={type.id} value={type.id}>{type.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={warehouseId} onValueChange={(value) => { setPageNumber(1); setWarehouseId(value) }}>
            <SelectTrigger>
              <SelectValue placeholder={t('documents.filters.warehouse')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All warehouses</SelectItem>
              {warehouses.map((warehouse) => (
                <SelectItem key={warehouse.id} value={String(warehouse.id)}>{warehouse.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="space-y-1 text-xs font-medium text-text-secondary">
            <span>From date</span>
            <Input type="date" value={startDate} onChange={(event) => { setPageNumber(1); setStartDate(event.target.value) }} />
          </label>
          <label className="space-y-1 text-xs font-medium text-text-secondary">
            <span>To date</span>
            <Input type="date" value={endDate} onChange={(event) => { setPageNumber(1); setEndDate(event.target.value) }} />
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {documentsQuery.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-14 rounded-none" />)}
            </div>
          ) : documents.length ? (
            <>
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
              <div className="flex items-center justify-between border-t border-border px-5 py-4 text-sm text-text-secondary">
                <Button variant="ghost" size="sm" disabled={!page?.hasPreviousPage} onClick={() => setPageNumber((current) => Math.max(1, current - 1))}>
                  {t('documents.pagination.previous')}
                </Button>
                <span>
                  {t('documents.pagination.page', {
                    current: page?.currentPageNumber ?? 1,
                    total: page?.numberOfPages ?? 1,
                  })}
                </span>
                <Button variant="ghost" size="sm" disabled={!page?.hasNextPage} onClick={() => setPageNumber((current) => current + 1)}>
                  {t('documents.pagination.next')}
                </Button>
              </div>
            </>
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
