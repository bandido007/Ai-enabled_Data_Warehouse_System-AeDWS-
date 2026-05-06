import { useMemo, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { BarChart3, ShieldAlert, Warehouse as WarehouseIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { EmptyState } from '@/components/common/empty-state'
import { MetricCard } from '@/components/common/metric-card'
import { PageHeader } from '@/components/common/page-header'
import { DocumentsStatusBar } from '@/components/regulator/documents-status-bar'
import { WarehouseRankingsTable, type RegulatoryWarehouseRow } from '@/components/regulator/warehouse-rankings-table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/use-auth'
import { getWarehouseStatistics, useWarehousesQuery } from '@/lib/queries'

type SortOption = 'name' | 'score' | 'region' | 'activity'

export function RegulatorDashboardPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [sortBy, setSortBy] = useState<SortOption>('score')
  const warehousesQuery = useWarehousesQuery(true)
  const warehouses = useMemo(() => warehousesQuery.data ?? [], [warehousesQuery.data])

  const statisticsQueries = useQueries({
    queries: warehouses.map((warehouse) => ({
      queryKey: ['regulatory-warehouse-statistics', warehouse.id],
      queryFn: () => getWarehouseStatistics(warehouse.id),
      enabled: warehouses.length > 0,
    })),
  })

  const loadingStats = statisticsQueries.some((query) => query.isLoading)
  const rows = useMemo<RegulatoryWarehouseRow[]>(() => {
    return warehouses.map((warehouse, index) => ({
      warehouse,
      statistics: statisticsQueries[index]?.data ?? null,
    }))
  }, [statisticsQueries, warehouses])

  const sortedRows = useMemo(() => {
    const next = [...rows]
    next.sort((left, right) => {
      if (sortBy === 'name') {
        return left.warehouse.name.localeCompare(right.warehouse.name)
      }

      if (sortBy === 'region') {
        return (left.statistics?.region || left.warehouse.regionName || '').localeCompare(
          right.statistics?.region || right.warehouse.regionName || ''
        )
      }

      if (sortBy === 'activity') {
        return new Date(right.statistics?.lastActivityAt || 0).getTime() - new Date(left.statistics?.lastActivityAt || 0).getTime()
      }

      return (right.statistics?.currentRankingScore ?? -1) - (left.statistics?.currentRankingScore ?? -1)
    })
    return next
  }, [rows, sortBy])

  const metrics = useMemo(() => {
    const highRisk = rows.filter((row) => row.statistics?.riskCategory === 'HIGH').length
    const scored = rows.map((row) => row.statistics?.currentRankingScore).filter((value): value is number => value != null)
    const average = scored.length ? (scored.reduce((sum, value) => sum + value, 0) / scored.length).toFixed(1) : '—'
    const inspections = rows.reduce((sum, row) => sum + (row.statistics?.inspectionFormsCount ?? 0), 0)

    return [
      {
        key: 'warehouses',
        label: t('regulator.dashboard.metrics.warehouses'),
        value: String(rows.length),
        delta: t('regulator.dashboard.warehouseSection'),
        trend: 'neutral' as const,
      },
      {
        key: 'highRisk',
        label: t('regulator.dashboard.metrics.highRisk'),
        value: String(highRisk),
        delta: t('regulator.dashboard.subtitle'),
        trend: highRisk > 0 ? ('down' as const) : ('neutral' as const),
      },
      {
        key: 'averageCompliance',
        label: t('regulator.dashboard.metrics.averageCompliance'),
        value: average,
        delta: scored.length ? t('regulator.dashboard.table.score') : t('regulator.risk.none'),
        trend: 'neutral' as const,
      },
      {
        key: 'inspections',
        label: t('regulator.dashboard.metrics.inspections'),
        value: String(inspections),
        delta: t('regulator.dashboard.totals.inspectionForms'),
        trend: 'neutral' as const,
      },
    ]
  }, [rows, t])

  const totals = useMemo(() => {
    return {
      documents: rows.reduce((sum, row) => sum + (row.statistics?.totalDocuments ?? 0), 0),
      approved: rows.reduce((sum, row) => sum + (row.statistics?.approvedDocuments ?? 0), 0),
      corrections: rows.reduce((sum, row) => sum + (row.statistics?.correctionsRequestedCount ?? 0), 0),
      inspections: rows.reduce((sum, row) => sum + (row.statistics?.inspectionFormsCount ?? 0), 0),
    }
  }, [rows])

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('regulator.dashboard.title')}
        subtitle={profile?.tenantName || profile?.warehouseName || t('regulator.dashboard.subtitle')}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {warehousesQuery.isLoading || loadingStats
          ? Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-32 rounded-md" />)
          : metrics.map((metric) => (
              <MetricCard key={metric.key} label={metric.label} value={metric.value} delta={metric.delta} trend={metric.trend} />
            ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between border-b border-border px-5 py-4">
          <CardTitle>{t('regulator.dashboard.warehouseSection')}</CardTitle>
          <div className="w-[180px]">
            <Select value={sortBy} onValueChange={(value: SortOption) => setSortBy(value)}>
              <SelectTrigger>
                <SelectValue placeholder={t('regulator.dashboard.sort.label')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">{t('regulator.dashboard.sort.name')}</SelectItem>
                <SelectItem value="score">{t('regulator.dashboard.sort.score')}</SelectItem>
                <SelectItem value="region">{t('regulator.dashboard.sort.region')}</SelectItem>
                <SelectItem value="activity">{t('regulator.dashboard.sort.activity')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {warehousesQuery.isLoading || loadingStats ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-16 rounded-none" />
              ))}
            </div>
          ) : sortedRows.length ? (
            <WarehouseRankingsTable rows={sortedRows} onSelect={(warehouseId) => navigate(`/regulator/warehouses/${warehouseId}`)} />
          ) : (
            <div className="p-4">
              <EmptyState
                icon={<WarehouseIcon className="h-6 w-6" />}
                title={t('regulator.dashboard.empty.title')}
                description={t('regulator.dashboard.empty.description')}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="mb-2 font-mono text-xs uppercase tracking-[0.05em] text-text-tertiary">{t('regulator.dashboard.totals.documents')}</div>
            <div className="text-2xl font-semibold text-text-primary">{totals.documents}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="mb-2 font-mono text-xs uppercase tracking-[0.05em] text-text-tertiary">{t('regulator.dashboard.totals.approved')}</div>
            <div className="text-2xl font-semibold text-text-primary">{totals.approved}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="mb-2 font-mono text-xs uppercase tracking-[0.05em] text-text-tertiary">{t('regulator.dashboard.totals.corrections')}</div>
            <div className="text-2xl font-semibold text-text-primary">{totals.corrections}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="mb-2 font-mono text-xs uppercase tracking-[0.05em] text-text-tertiary">{t('regulator.dashboard.totals.inspectionForms')}</div>
            <div className="flex items-center justify-between gap-3">
              <div className="text-2xl font-semibold text-text-primary">{totals.inspections}</div>
              <BarChart3 className="h-5 w-5 text-brand-teal" />
            </div>
          </CardContent>
        </Card>
      </div>

      {sortedRows[0]?.statistics ? (
        <Card>
          <CardHeader className="border-b border-border px-5 py-4">
            <CardTitle>{t('regulator.dashboard.byNumbers')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <div className="space-y-3">
              {sortedRows.slice(0, 3).map((row) => (
                <div key={row.warehouse.id} className="rounded-md border border-border-subtle px-4 py-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-text-primary">{row.warehouse.name}</div>
                      <div className="text-xs text-text-tertiary">{row.statistics?.region || row.warehouse.regionName || '—'}</div>
                    </div>
                    <ShieldAlert className="h-4 w-4 text-brand-teal" />
                  </div>
                  <DocumentsStatusBar counts={row.statistics?.documentsByStatus ?? {}} />
                </div>
              ))}
            </div>
            <div className="rounded-md border border-border-subtle bg-canvas px-4 py-4">
              <div className="text-sm font-medium text-text-primary">{t('regulator.dashboard.metrics.highRisk')}</div>
              <p className="mt-2 text-sm text-text-secondary">
                {t('regulator.dashboard.subtitle')}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
