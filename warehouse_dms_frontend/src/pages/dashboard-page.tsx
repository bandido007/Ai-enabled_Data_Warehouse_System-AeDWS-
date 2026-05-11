import { CalendarDays, FileClock, History } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { EmptyState } from '@/components/common/empty-state'
import { MetricCard } from '@/components/common/metric-card'
import { PageHeader } from '@/components/common/page-header'
import { StatusBadge } from '@/components/common/status-badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/use-auth'
import { buildActivityFeed, buildDashboardMetrics, buildDocumentMeta } from '@/lib/mock-data'
import { useDocumentsQuery, useDocumentStatsQuery, useLeaveBalanceQuery } from '@/lib/queries'

export function DashboardPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { profile, primaryRole } = useAuth()

  // Filter the queue to what's actionable for each role — per spec:
  // Manager sees PENDING_MANAGER, CEO sees PENDING_CEO, Staff sees PENDING_STAFF
  const queueStatus =
    primaryRole === 'MANAGER' ? 'PENDING_MANAGER' :
    primaryRole === 'CEO'     ? 'PENDING_CEO' :
    primaryRole === 'STAFF'   ? 'PENDING_STAFF' :
    undefined

  const documentsQuery = useDocumentsQuery({ itemsPerPage: 100, pageNumber: 1, status: queueStatus }, true)
  const statsQuery = useDocumentStatsQuery(true)
  const leaveBalanceQuery = useLeaveBalanceQuery(
    primaryRole === 'STAFF' || primaryRole === 'MANAGER' || primaryRole === 'CEO',
  )

  const documents = documentsQuery.data?.data ?? []
  const queueTotal = documentsQuery.data?.page?.totalElements ?? documents.length
  const stats = statsQuery.data
  const metrics = buildDashboardMetrics(primaryRole, documents, stats)
  const activities = buildActivityFeed(documents, stats)

  const greeting = profile?.preferredLanguage === 'sw' ? t('dashboard.habari') : t('dashboard.hello')
  const firstName = profile?.firstName || profile?.username || 'Operator'

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greeting}, ${firstName}`}
        subtitle={t('dashboard.subtitle', { count: documents.length })}
      />

      <div className="grid gap-4 xl:grid-cols-4 md:grid-cols-2">
        {documentsQuery.isLoading
          ? Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-32 rounded-md" />)
          : metrics.map((metric) => (
              <MetricCard
                key={metric.key}
                label={metric.label}
                value={metric.value}
                delta={metric.delta}
                trend={metric.trend}
                href={metric.href}
              />
            ))}
      </div>

      {/* Leave balance strip — Staff / Manager / CEO only */}
      {(primaryRole === 'STAFF' || primaryRole === 'MANAGER' || primaryRole === 'CEO') && (
        <Card
          className="cursor-pointer transition-shadow hover:shadow-md"
          onClick={() => navigate('/leave')}
        >
          <CardContent className="flex flex-wrap items-center gap-6 px-5 py-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <span>Leave Balance {new Date().getFullYear()}</span>
            </div>
            {leaveBalanceQuery.isLoading ? (
              <div className="flex gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-24 rounded" />
                ))}
              </div>
            ) : leaveBalanceQuery.data ? (
              <>
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="text-muted-foreground">Allocated:</span>
                  <span className="font-semibold">{leaveBalanceQuery.data.annualDays}d</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="text-muted-foreground">Used:</span>
                  <span className="font-semibold text-orange-500">{leaveBalanceQuery.data.daysUsed}d</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="text-muted-foreground">Remaining:</span>
                  <span
                    className={`font-semibold ${
                      leaveBalanceQuery.data.daysRemaining === 0
                        ? 'text-red-500'
                        : 'text-green-600'
                    }`}
                  >
                    {leaveBalanceQuery.data.daysRemaining}d
                  </span>
                </div>
                {/* Mini progress bar */}
                <div className="flex-1 min-w-[120px]">
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        leaveBalanceQuery.data.daysRemaining === 0
                          ? 'bg-red-500'
                          : leaveBalanceQuery.data.daysUsed / leaveBalanceQuery.data.annualDays >= 0.75
                          ? 'bg-yellow-500'
                          : 'bg-green-500'
                      }`}
                      style={{
                        width: `${Math.min(
                          (leaveBalanceQuery.data.daysUsed /
                            leaveBalanceQuery.data.annualDays) *
                            100,
                          100,
                        )}%`,
                      }}
                    />
                  </div>
                </div>
                <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                  {(primaryRole === 'MANAGER' || primaryRole === 'CEO') && (
                    <button
                      className="text-xs text-muted-foreground hover:underline"
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate('/leave/management')
                      }}
                    >
                      Manage team →
                    </button>
                  )}
                  <button
                    className="rounded-md bg-brand-teal px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-teal-hover transition-colors"
                    onClick={(e) => {
                      e.stopPropagation()
                      navigate('/forms/staff-permission?leaveType=annual')
                    }}
                  >
                    Apply for Leave
                  </button>
                </span>
              </>
            ) : null}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between border-b border-border px-5 py-4">
            <CardTitle>
              {primaryRole === 'MANAGER' ? 'Documents Awaiting Approval' :
               primaryRole === 'CEO'     ? 'Documents for Final Authorization' :
               t('dashboard.queueTitle')}
            </CardTitle>
            <button
              type="button"
              onClick={() => navigate('/documents')}
              className="text-xs font-semibold text-brand-teal hover:underline"
            >
              View all {queueTotal}
            </button>
          </CardHeader>
          <CardContent className="px-5 py-4">
            {documentsQuery.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-16 rounded-md" />
                ))}
              </div>
            ) : documents.length ? (
              <div className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
                {documents.map((document) => {
                  const meta = buildDocumentMeta(document)
                  return (
                    <div
                      key={document.id}
                      onClick={() => navigate(`/documents/${document.id}`)}
                      className="flex cursor-pointer items-start justify-between gap-4 rounded-md border border-border-subtle px-4 py-3 transition-colors hover:border-brand-teal/40 hover:bg-canvas"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-3">
                          <span className="font-medium text-text-primary">{document.title}</span>
                          <StatusBadge status={document.status} />
                        </div>
                        <p className="text-sm text-text-secondary">{meta.subtitle}</p>
                        <div className="mt-2 font-mono text-xs text-text-tertiary">{document.documentTypeId}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-xs text-text-tertiary">#{document.id}</div>
                        <div className="mt-1 text-sm text-text-secondary">{meta.confidence}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <EmptyState
                icon={<FileClock className="h-6 w-6" />}
                title={t('dashboard.queueTitle')}
                description={t('dashboard.emptyQueue')}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border px-5 py-4">
            <CardTitle>{t('dashboard.activityTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="px-5 py-4">
            {activities.length ? (
              <div className="space-y-4">
                {activities.map((activity) => (
                  <div key={activity.id} className="border-l-[3px] border-brand-teal pl-3">
                    <div className="text-sm font-medium text-text-primary">{activity.title}</div>
                    <div className="text-sm text-text-secondary">{activity.subtitle}</div>
                    <div className="mt-1 font-mono text-xs text-text-tertiary">{activity.dateLabel}</div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<History className="h-6 w-6" />}
                title={t('dashboard.activityTitle')}
                description={t('dashboard.emptyActivity')}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
