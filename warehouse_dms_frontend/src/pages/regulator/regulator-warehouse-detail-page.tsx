import { useMemo } from 'react'
import { FileText, History } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { EmptyState } from '@/components/common/empty-state'
import { MetricCard } from '@/components/common/metric-card'
import { PageHeader } from '@/components/common/page-header'
import { StatusBadge } from '@/components/common/status-badge'
import { DocumentsStatusBar } from '@/components/regulator/documents-status-bar'
import { RiskBadge } from '@/components/regulator/risk-badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useDocumentsQuery, useWarehouseStatisticsQuery, useWarehousesQuery } from '@/lib/queries'
import { formatRelativeTime } from '@/lib/utils'

export function RegulatorWarehouseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const warehouseStatsQuery = useWarehouseStatisticsQuery(id, Boolean(id))
  const warehousesQuery = useWarehousesQuery(true)
  const documentsQuery = useDocumentsQuery({ warehouseId: id ? Number(id) : undefined, itemsPerPage: 10 }, Boolean(id))

  const warehouse = useMemo(
    () => (warehousesQuery.data ?? []).find((item) => String(item.id) === id),
    [id, warehousesQuery.data]
  )
  const statistics = warehouseStatsQuery.data
  const documents = documentsQuery.data?.data ?? []

  if (warehouseStatsQuery.isLoading || warehousesQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 rounded-md" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-md" />)}
        </div>
        <Skeleton className="h-56 rounded-md" />
      </div>
    )
  }

  if (!statistics) {
    return <div className="rounded-md border border-semantic-error bg-semantic-error-bg px-4 py-6 text-sm text-semantic-error">{t('regulator.detail.loadError')}</div>
  }

  const metrics = [
    {
      key: 'ranking',
      label: t('regulator.detail.metrics.ranking'),
      value: statistics.currentRankingScore == null ? '—' : statistics.currentRankingScore.toFixed(1),
      delta: statistics.complianceTrend || t('regulator.risk.none'),
      trend: 'neutral' as const,
    },
    {
      key: 'risk',
      label: t('regulator.detail.metrics.risk'),
      value: statistics.riskCategory || '—',
      delta: t(`regulator.risk.${statistics.riskCategory || 'none'}`),
      trend: statistics.riskCategory === 'HIGH' ? ('down' as const) : ('neutral' as const),
    },
    {
      key: 'documents',
      label: t('regulator.detail.metrics.documents'),
      value: String(statistics.totalDocuments),
      delta: `${statistics.approvedDocuments} approved`,
      trend: 'neutral' as const,
    },
    {
      key: 'activity',
      label: t('regulator.detail.metrics.activity'),
      value: formatRelativeTime(statistics.lastActivityAt, i18n.language),
      delta: statistics.region || '—',
      trend: 'neutral' as const,
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={statistics.warehouseName}
        subtitle={[statistics.region, warehouse?.tenantName].filter(Boolean).join(' · ')}
        actions={<Link to="/regulator" className="text-sm font-medium text-brand-teal">← {t('regulator.detail.back')}</Link>}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <MetricCard key={metric.key} label={metric.label} value={metric.value} delta={metric.delta} trend={metric.trend} />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader className="border-b border-border px-5 py-4">
            <CardTitle>{t('regulator.detail.breakdown')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 px-5 py-5">
            <DocumentsStatusBar counts={statistics.documentsByStatus} />
            <div className="flex flex-wrap gap-2">
              <RiskBadge riskCategory={statistics.riskCategory} />
              <StatusBadge status="APPROVED" />
              <StatusBadge status="PENDING_STAFF" />
              <StatusBadge status="REJECTED" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border px-5 py-4">
            <CardTitle>{t('regulator.detail.byType')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-5 py-5">
            {Object.entries(statistics.documentsByType).length ? (
              Object.entries(statistics.documentsByType)
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => (
                  <div key={type}>
                    <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                      <span className="text-text-primary">{type}</span>
                      <span className="font-mono text-xs text-text-tertiary">{count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-border-subtle">
                      <div className="h-2 rounded-full bg-brand-teal" style={{ width: `${Math.max(8, (count / statistics.totalDocuments) * 100)}%` }} />
                    </div>
                  </div>
                ))
            ) : (
              <EmptyState icon={<FileText className="h-6 w-6" />} title={t('regulator.detail.byType')} description={t('regulator.dashboard.empty.description')} />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="border-b border-border px-5 py-4">
          <CardTitle>{t('regulator.detail.recent')}</CardTitle>
        </CardHeader>
        <CardContent className="px-5 py-5">
          {documentsQuery.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-16 rounded-md" />)}
            </div>
          ) : documents.length ? (
            <div className="space-y-3">
              {documents.map((document) => (
                <button
                  key={document.id}
                  type="button"
                  onClick={() => navigate(`/regulator/documents/${document.id}`)}
                  className="flex w-full items-start justify-between gap-4 rounded-md border border-border-subtle px-4 py-3 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-text-primary">{document.title}</div>
                    <div className="mt-1 text-sm text-text-secondary">{document.documentTypeId}</div>
                  </div>
                  <div className="text-right">
                    <StatusBadge status={document.status} />
                    <div className="mt-2 text-xs text-text-tertiary">{formatRelativeTime(document.updatedDate, i18n.language)}</div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState icon={<History className="h-6 w-6" />} title={t('regulator.detail.recent')} description={t('regulator.detail.recentEmpty')} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
