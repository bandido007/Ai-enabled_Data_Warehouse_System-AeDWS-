import { useMemo } from 'react'
import { FileText, History, RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { EmptyState } from '@/components/common/empty-state'
import { MetricCard } from '@/components/common/metric-card'
import { PageHeader } from '@/components/common/page-header'
import { StatusBadge } from '@/components/common/status-badge'
import { DocumentsStatusBar } from '@/components/regulator/documents-status-bar'
import { RiskBadge } from '@/components/regulator/risk-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useDocumentsQuery, useRecomputeRankingMutation, useWarehouseRankingQuery, useWarehouseStatisticsQuery, useWarehousesQuery } from '@/lib/queries'
import { formatRelativeTime } from '@/lib/utils'

export function RegulatorWarehouseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const warehouseStatsQuery = useWarehouseStatisticsQuery(id, Boolean(id))
  const warehousesQuery = useWarehousesQuery(true)
  const documentsQuery = useDocumentsQuery({ warehouseId: id ? Number(id) : undefined, itemsPerPage: 10 }, Boolean(id))
  const rankingQuery = useWarehouseRankingQuery(id, Boolean(id))
  const recomputeMutation = useRecomputeRankingMutation(id)

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
        actions={
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              disabled={recomputeMutation.isPending}
              onClick={() =>
                recomputeMutation.mutate(undefined, {
                  onSuccess: () => alert('Ranking recomputed successfully'),
                  onError: (err: Error) => alert(err.message || 'Failed to recompute ranking'),
                })
              }
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${recomputeMutation.isPending ? 'animate-spin' : ''}`} />
              Recompute Ranking
            </Button>
            <Link to="/regulator" className="text-sm font-medium text-brand-teal">← {t('regulator.detail.back')}</Link>
          </div>
        }
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
          <CardTitle>Compliance Ranking Details</CardTitle>
        </CardHeader>
        <CardContent className="px-5 py-5">
          {rankingQuery.isLoading ? (
            <Skeleton className="h-24 rounded-md" />
          ) : rankingQuery.data ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-3xl font-bold text-text-primary">{rankingQuery.data.finalScore.toFixed(1)}</span>
                <span className="text-sm text-text-tertiary">/ 100</span>
                <RiskBadge riskCategory={rankingQuery.data.riskCategory} />
              </div>
              <p className="text-sm text-text-secondary">{rankingQuery.data.aiExplanation}</p>
              <div className="space-y-2">
                {rankingQuery.data.contributingFactors.map((factor, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm">
                    {factor.type === 'positive' ? (
                      <TrendingUp className="h-4 w-4 text-semantic-success" />
                    ) : factor.type === 'negative' ? (
                      <TrendingDown className="h-4 w-4 text-semantic-error" />
                    ) : (
                      <Minus className="h-4 w-4 text-text-tertiary" />
                    )}
                    <span className={factor.type === 'positive' ? 'text-semantic-success' : factor.type === 'negative' ? 'text-semantic-error' : 'text-text-secondary'}>
                      {factor.label}
                    </span>
                  </div>
                ))}
              </div>
              <div className="text-xs text-text-tertiary">Last computed: {new Date(rankingQuery.data.computationDate).toLocaleDateString()}</div>
            </div>
          ) : (
            <EmptyState
              icon={<TrendingUp className="h-6 w-6" />}
              title="No ranking computed yet"
              description="Click Recompute Ranking to generate a compliance score for this warehouse."
            />
          )}
        </CardContent>
      </Card>

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
