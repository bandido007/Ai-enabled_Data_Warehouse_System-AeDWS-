import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, FileSearch } from 'lucide-react'

import { ConfidenceBadge } from '@/components/common/confidence-badge'
import { EmptyState } from '@/components/common/empty-state'
import { PageHeader } from '@/components/common/page-header'
import { StatusBadge } from '@/components/common/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAuth } from '@/hooks/use-auth'
import {
  ALL_DOCUMENT_CATEGORIES,
  getDocumentTypeCategories,
  getDocumentTypesForCategory,
} from '@/lib/document-types'
import { formatShortDate } from '@/lib/utils'
import { useDocumentsQuery, useDocumentTypesQuery, useWarehousesQuery } from '@/lib/queries'

export function DocumentsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { primaryRole } = useAuth()
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
  const documentTypesQuery = useDocumentTypesQuery(true)
  const warehousesQuery = useWarehousesQuery(primaryRole === 'CEO')

  // Pending-action count for action-required banner
  const pendingStatus = primaryRole === 'MANAGER' ? 'PENDING_MANAGER' : primaryRole === 'CEO' ? 'PENDING_CEO' : null
  const pendingCountQuery = useDocumentsQuery(
    useMemo(() => ({ itemsPerPage: 1, pageNumber: 1, status: pendingStatus ?? undefined }), [pendingStatus]),
    !!pendingStatus
  )
  const pendingCount = pendingCountQuery.data?.page?.totalElements ?? 0

  const documents = documentsQuery.data?.data ?? []
  const page = documentsQuery.data?.page
  const documentTypes = useMemo(() => documentTypesQuery.data ?? [], [documentTypesQuery.data])
  const warehouses = warehousesQuery.data ?? []
  const documentCategories = useMemo(() => getDocumentTypeCategories(documentTypes), [documentTypes])
  const filteredDocumentTypes = useMemo(
    () => getDocumentTypesForCategory(documentTypes, documentCategory),
    [documentCategory, documentTypes]
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('documents.title')}
        subtitle={t('documents.subtitle')}
      />

      {/* Action-required banner for manager / CEO */}
      {pendingStatus && pendingCount > 0 && status !== pendingStatus && (
        <div className="flex items-center justify-between rounded-lg border border-semantic-warning bg-semantic-warning-bg px-4 py-3 text-sm">
          <div className="flex items-center gap-2 text-semantic-warning">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              <strong>{pendingCount}</strong>{' '}
              {primaryRole === 'MANAGER' ? 'document(s) are waiting for your approval.' : 'document(s) require your final authorization.'}
            </span>
          </div>
          <button
            onClick={() => setStatus(pendingStatus)}
            className="ml-4 shrink-0 rounded bg-semantic-warning px-3 py-1 text-xs font-medium text-white hover:opacity-90"
          >
            Show pending
          </button>
        </div>
      )}

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-7">
          <Input
            value={searchTerm}
            onChange={(event) => {
              setPageNumber(1)
              setSearchTerm(event.target.value)
            }}
            placeholder={t('documents.filters.search')}
            className="xl:col-span-2"
          />
          <Select
            value={status}
            onValueChange={(value) => {
              setPageNumber(1)
              setStatus(value)
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('documents.filters.status')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="PENDING_STAFF">{t('status.PENDING_STAFF')}</SelectItem>
              <SelectItem value="PENDING_MANAGER">{t('status.PENDING_MANAGER')}</SelectItem>
              <SelectItem value="PENDING_CEO">{t('status.PENDING_CEO')}</SelectItem>
              <SelectItem value="APPROVED">{t('status.APPROVED')}</SelectItem>
              <SelectItem value="REJECTED">{t('status.REJECTED')}</SelectItem>
              <SelectItem value="CORRECTION_NEEDED">{t('status.CORRECTION_NEEDED')}</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={documentCategory}
            onValueChange={(value) => {
              setPageNumber(1)
              setDocumentCategory(value)
              setDocumentTypeId('all')
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Document category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_DOCUMENT_CATEGORIES}>All document categories</SelectItem>
              {documentCategories.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={documentTypeId}
            onValueChange={(value) => {
              setPageNumber(1)
              setDocumentTypeId(value)
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('documents.filters.type')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {documentCategory === ALL_DOCUMENT_CATEGORIES ? 'All document types' : `All ${documentCategory} types`}
              </SelectItem>
              {filteredDocumentTypes.map((type) => (
                <SelectItem key={type.id} value={type.id}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {primaryRole === 'CEO' ? (
            <Select
              value={warehouseId}
              onValueChange={(value) => {
                setPageNumber(1)
                setWarehouseId(value)
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('documents.filters.warehouse')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All warehouses</SelectItem>
                {warehouses.map((warehouse) => (
                  <SelectItem key={warehouse.id} value={String(warehouse.id)}>
                    {warehouse.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <label className="space-y-1 text-xs font-medium text-text-secondary">
            <span>From date</span>
            <Input
              type="date"
              value={startDate}
              onChange={(event) => {
                setPageNumber(1)
                setStartDate(event.target.value)
              }}
            />
          </label>
          <label className="space-y-1 text-xs font-medium text-text-secondary">
            <span>To date</span>
            <Input
              type="date"
              value={endDate}
              onChange={(event) => {
                setPageNumber(1)
                setEndDate(event.target.value)
              }}
            />
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between border-b border-border px-5 py-4">
          <CardTitle>{t('documents.table.title')}</CardTitle>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => documentsQuery.refetch()}>
              {t('documents.actions.filter')}
            </Button>
            <Button variant="secondary" size="sm">{t('documents.actions.export')}</Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {documentsQuery.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-14 rounded-none" />
              ))}
            </div>
          ) : documents.length ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('documents.table.columns.id')}</TableHead>
                    <TableHead>{t('documents.table.columns.document')}</TableHead>
                    <TableHead>{t('documents.table.columns.type')}</TableHead>
                    <TableHead>{t('documents.table.columns.depositor')}</TableHead>
                    <TableHead>{t('documents.table.columns.confidence')}</TableHead>
                    <TableHead>{t('documents.table.columns.status')}</TableHead>
                    <TableHead>{t('documents.table.columns.submitted')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((document) => (
                    <TableRow key={document.id} className="cursor-pointer" onClick={() => navigate(`/documents/${document.id}`)}>
                      <TableCell className="font-mono text-xs text-text-tertiary">{String(document.id).padStart(6, '0')}</TableCell>
                      <TableCell>
                        <div className="font-medium text-text-primary">{document.title}</div>
                        <div className="mt-0.5 text-xs text-text-tertiary">{document.aiReviewNotes || document.aiSummary || 'AI review pending'}</div>
                      </TableCell>
                      <TableCell>{document.documentTypeId}</TableCell>
                      <TableCell>{document.uploaderUsername}</TableCell>
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
              <EmptyState
                icon={<FileSearch className="h-6 w-6" />}
                title={t('documents.empty.title')}
                description={t('documents.empty.description')}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
