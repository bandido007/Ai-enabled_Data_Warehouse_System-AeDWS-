import { useMemo, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck, ShieldAlert, TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { EmptyState } from '@/components/common/empty-state'
import { PageHeader } from '@/components/common/page-header'
import { RiskBadge } from '@/components/regulator/risk-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { getWarehouseStatistics, useRecomputeRankingMutation, useWarehousesQuery } from '@/lib/queries'
import type { WarehouseStatistics } from '@/types/api'

type RiskFilter = 'ALL' | 'HIGH' | 'MEDIUM' | 'LOW'

function ScoreGauge({ score }: { score: number | null | undefined }) {
  if (score == null) return <span className="text-sm text-text-tertiary">—</span>
  const pct = Math.min(100, Math.max(0, score))
  const color = pct >= 70 ? 'bg-semantic-success' : pct >= 40 ? 'bg-semantic-warning' : 'bg-semantic-error'
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 rounded-full bg-border-subtle">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 text-right font-mono text-sm font-semibold text-text-primary">
        {score.toFixed(1)}
      </span>
    </div>
  )
}

function TrendIcon({ trend }: { trend?: string | null }) {
  if (trend === 'IMPROVING') return <TrendingUp className="h-4 w-4 text-semantic-success" />
  if (trend === 'DECLINING') return <TrendingDown className="h-4 w-4 text-semantic-error" />
  return <Minus className="h-4 w-4 text-text-tertiary" />
}

function WarehouseComplianceCard({
  index,
  warehouse,
  statistics,
  onNavigate,
}: {
  index: number
  warehouse: { id: number; name: string; regionName?: string | null }
  statistics: WarehouseStatistics | null
  onNavigate: (id: number) => void
}) {
  const recomputeMutation = useRecomputeRankingMutation(warehouse.id)

  const approvalRate = statistics?.totalDocuments
    ? Math.round((statistics.approvedDocuments / statistics.totalDocuments) * 100)
    : 0

  return (
    <Card className="overflow-hidden">
      <div
        className={`h-1 w-full ${
          statistics?.riskCategory === 'HIGH'
            ? 'bg-semantic-error'
            : statistics?.riskCategory === 'MEDIUM'
              ? 'bg-semantic-warning'
              : statistics?.riskCategory === 'LOW'
                ? 'bg-semantic-success'
                : 'bg-border-subtle'
        }`}
      />
      <CardHeader className="flex flex-row items-start justify-between gap-4 px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-canvas font-mono text-xs font-semibold text-text-tertiary border border-border-subtle">
            {String(index + 1).padStart(2, '0')}
          </div>
          <div>
            <button
              type="button"
              onClick={() => onNavigate(warehouse.id)}
              className="text-left font-semibold text-text-primary hover:text-brand-teal transition-colors"
            >
              {warehouse.name}
            </button>
            <div className="mt-0.5 text-xs text-text-tertiary">
              {statistics?.region || warehouse.regionName || '—'}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={recomputeMutation.isPending}
            title="Recompute compliance score"
            onClick={(e) => {
              e.stopPropagation()
              recomputeMutation.mutate(undefined, {
                onSuccess: () => window.location.reload(),
              })
            }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${recomputeMutation.isPending ? 'animate-spin' : ''}`} />
          </Button>
          <RiskBadge riskCategory={statistics?.riskCategory} />
        </div>
      </CardHeader>

      <CardContent className="space-y-4 px-5 pb-5">
        {/* Compliance Score */}
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs text-text-tertiary uppercase tracking-wide">Compliance Score</span>
          <ScoreGauge score={statistics?.currentRankingScore} />
        </div>

        {/* Trend */}
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs text-text-tertiary uppercase tracking-wide">Trend</span>
          <div className="flex items-center gap-1.5 text-sm text-text-secondary">
            <TrendIcon trend={statistics?.complianceTrend} />
            {statistics?.complianceTrend ?? '—'}
          </div>
        </div>

        {/* Document stats */}
        <div className="grid grid-cols-3 gap-3 rounded-md bg-canvas px-3 py-3">
          <div className="text-center">
            <div className="text-lg font-semibold text-text-primary">{statistics?.totalDocuments ?? '—'}</div>
            <div className="mt-0.5 text-xs text-text-tertiary">Total Docs</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-semantic-success">{statistics?.approvedDocuments ?? '—'}</div>
            <div className="mt-0.5 text-xs text-text-tertiary">Approved</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-text-primary">{approvalRate}%</div>
            <div className="mt-0.5 text-xs text-text-tertiary">Approval Rate</div>
          </div>
        </div>

        {/* Compliance signals */}
        <div className="flex flex-wrap gap-2">
          {(statistics?.inspectionFormsCount ?? 0) > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-semantic-success px-2 py-0.5 text-xs text-semantic-success">
              <CheckCircle2 className="h-3 w-3" />
              {statistics!.inspectionFormsCount} Inspection{statistics!.inspectionFormsCount !== 1 ? 's' : ''}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-semantic-error px-2 py-0.5 text-xs text-semantic-error">
              <AlertTriangle className="h-3 w-3" />
              No Inspections
            </span>
          )}
          {(statistics?.correctionsRequestedCount ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-semantic-warning px-2 py-0.5 text-xs text-semantic-warning">
              <AlertTriangle className="h-3 w-3" />
              {statistics!.correctionsRequestedCount} Correction{statistics!.correctionsRequestedCount !== 1 ? 's' : ''}
            </span>
          )}
          {(statistics?.rejectedDocuments ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-semantic-error px-2 py-0.5 text-xs text-semantic-error">
              <ShieldAlert className="h-3 w-3" />
              {statistics!.rejectedDocuments} Rejected
            </span>
          )}
        </div>

        {/* View detail button */}
        <Button
          variant="secondary"
          size="sm"
          className="w-full"
          onClick={() => onNavigate(warehouse.id)}
        >
          <ShieldCheck className="mr-2 h-4 w-4" />
          View Full Compliance Report
        </Button>
      </CardContent>
    </Card>
  )
}

export function RegulatorWarehouseCompliancePage() {
  const navigate = useNavigate()
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('ALL')

  const warehousesQuery = useWarehousesQuery(true)
  const warehouses = useMemo(() => warehousesQuery.data ?? [], [warehousesQuery.data])

  const statsQueries = useQueries({
    queries: warehouses.map((w) => ({
      queryKey: ['regulatory-warehouse-statistics', w.id],
      queryFn: () => getWarehouseStatistics(w.id),
      enabled: warehouses.length > 0,
    })),
  })

  const loadingStats = statsQueries.some((q) => q.isLoading)

  const rows = useMemo(
    () =>
      warehouses.map((w, i) => ({
        warehouse: w,
        statistics: (statsQueries[i]?.data ?? null) as WarehouseStatistics | null,
      })),
    [warehouses, statsQueries],
  )

  const filtered = useMemo(() => {
    const sorted = [...rows].sort(
      (a, b) => (b.statistics?.currentRankingScore ?? -1) - (a.statistics?.currentRankingScore ?? -1),
    )
    if (riskFilter === 'ALL') return sorted
    return sorted.filter((r) => r.statistics?.riskCategory === riskFilter)
  }, [rows, riskFilter])

  // Summary counts
  const highCount = rows.filter((r) => r.statistics?.riskCategory === 'HIGH').length
  const medCount = rows.filter((r) => r.statistics?.riskCategory === 'MEDIUM').length
  const lowCount = rows.filter((r) => r.statistics?.riskCategory === 'LOW').length

  const filters: { label: string; value: RiskFilter; count: number; color: string }[] = [
    { label: 'All Warehouses', value: 'ALL', count: rows.length, color: 'border-border text-text-primary' },
    { label: 'High Risk', value: 'HIGH', count: highCount, color: 'border-semantic-error text-semantic-error' },
    { label: 'Medium Risk', value: 'MEDIUM', count: medCount, color: 'border-semantic-warning text-semantic-warning' },
    { label: 'Low Risk', value: 'LOW', count: lowCount, color: 'border-semantic-success text-semantic-success' },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Warehouse Compliance"
        subtitle="Live compliance scores and risk assessments for all warehouses in your jurisdiction"
      />

      {/* Risk filter tabs */}
      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setRiskFilter(f.value)}
            className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
              riskFilter === f.value
                ? `${f.color} bg-canvas`
                : 'border-border-subtle text-text-tertiary hover:text-text-secondary'
            }`}
          >
            {f.label}
            <span className="rounded-full bg-border-subtle px-1.5 py-0.5 font-mono text-xs">
              {f.count}
            </span>
          </button>
        ))}
      </div>

      {/* Cards grid */}
      {warehousesQuery.isLoading || loadingStats ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-md" />
          ))}
        </div>
      ) : filtered.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((row, index) => (
            <WarehouseComplianceCard
              key={row.warehouse.id}
              index={index}
              warehouse={row.warehouse}
              statistics={row.statistics}
              onNavigate={(id) => navigate(`/regulator/warehouses/${id}`)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<ShieldCheck className="h-6 w-6" />}
          title="No warehouses match this filter"
          description="Try selecting a different risk level or check back once rankings are computed."
        />
      )}
    </div>
  )
}
