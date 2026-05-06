import type { ActivityItem, DocumentRecord, DocumentStats, MetricItem, UserRole } from '@/types/api'

import { formatPercent, formatShortDate, startCase } from './utils'

function formatApprovalTime(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return '—'
  if (hours < 1) return `${Math.round(hours * 60)}m`
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function buildDashboardMetrics(
  role: UserRole | null,
  documents: DocumentRecord[],
  stats?: DocumentStats | null,
): MetricItem[] {
  const sc = stats?.statusCounts ?? {}
  const approvedThisWeek = stats?.approvedThisWeek ?? documents.filter((d) => d.status === 'APPROVED').length
  const rejectedThisWeek = stats?.rejectedThisWeek ?? documents.filter((d) => d.status === 'REJECTED').length
  const avgTime = formatApprovalTime(stats?.avgApprovalHours)

  const pendingStaff = sc['PENDING_STAFF'] ?? documents.filter((d) => d.status === 'PENDING_STAFF').length
  const pendingManager = sc['PENDING_MANAGER'] ?? documents.filter((d) => d.status === 'PENDING_MANAGER').length
  const pendingCeo = sc['PENDING_CEO'] ?? documents.filter((d) => d.status === 'PENDING_CEO').length
  const correctionCount = sc['CORRECTION_NEEDED'] ?? documents.filter((d) => d.status === 'CORRECTION_NEEDED').length
  const todayCount = documents.filter((d) => d.createdDate === new Date().toISOString().slice(0, 10)).length
  const totalDocs = stats ? Object.values(sc).reduce((a, b) => a + b, 0) : documents.length

  switch (role) {
    case 'MANAGER':
      return [
        { key: 'pendingApproval', label: 'Pending approval', value: String(pendingManager), delta: 'Needs manager action', trend: 'neutral', href: '/documents' },
        { key: 'approvedThisWeek', label: 'Approved this week', value: String(approvedThisWeek), delta: 'Last 7 days', trend: 'up' },
        { key: 'rejectedThisWeek', label: 'Rejected this week', value: String(rejectedThisWeek), delta: 'Last 7 days', trend: 'down' },
        { key: 'avgApprovalTime', label: 'Avg approval time', value: avgTime, delta: avgTime === '—' ? 'No approvals yet' : 'from submission to approved', trend: 'neutral' },
      ]
    case 'CEO':
      return [
        { key: 'finalApprovals', label: 'Awaiting final auth', value: String(pendingCeo), delta: 'Needs CEO review', trend: 'neutral', href: '/documents' },
        { key: 'approvedThisWeek', label: 'Approved this week', value: String(approvedThisWeek), delta: 'Last 7 days', trend: 'up' },
        { key: 'tenantDocuments', label: 'Total documents', value: String(totalDocs), delta: 'All active records', trend: 'neutral' },
        { key: 'avgApprovalTime', label: 'Avg approval time', value: avgTime, delta: avgTime === '—' ? 'No approvals yet' : 'from submission to approved', trend: 'neutral' },
      ]
    default:
      return [
        { key: 'awaitingReview', label: 'Awaiting review', value: String(pendingStaff), delta: 'Needs staff action', trend: 'up' },
        { key: 'processedToday', label: 'Processed today', value: String(todayCount), delta: 'Documents submitted today', trend: 'up' },
        { key: 'correctionsSent', label: 'Corrections sent', value: String(correctionCount), delta: 'Awaiting depositor', trend: 'down' },
        { key: 'avgReviewTime', label: 'Avg review time', value: avgTime, delta: avgTime === '—' ? 'No approvals yet' : 'from submission to approved', trend: 'neutral' },
      ]
  }
}

export function buildActivityFeed(documents: DocumentRecord[], stats?: DocumentStats | null): ActivityItem[] {
  // Use real API activity if available
  if (stats?.recentActivity && stats.recentActivity.length > 0) {
    return stats.recentActivity.map((item) => ({
      id: `${item.documentId}-${item.action}-${item.createdDate}`,
      title: `${startCase(item.action)} · ${item.documentTitle}`,
      subtitle: `${item.fromStatus} → ${item.toStatus}${item.actorName !== 'System' ? ` by ${item.actorName}` : ''}`,
      dateLabel: formatShortDate(item.createdDate),
    }))
  }
  // Fall back to transitions embedded in the doc list
  return documents
    .flatMap((document) =>
      document.transitions.map((transition) => ({
        id: `${document.id}-${transition.id}`,
        title: `${startCase(transition.action)} · ${document.title}`,
        subtitle: transition.reason || `${transition.fromStatus} → ${transition.toStatus}`,
        dateLabel: formatShortDate(transition.createdDate),
      }))
    )
    .sort((left, right) => right.dateLabel.localeCompare(left.dateLabel))
    .slice(0, 10)
}

export function buildDocumentMeta(document: DocumentRecord) {
  const confidence = formatPercent(document.aiConfidenceScore)
  const subtitle = document.aiReviewNotes || document.aiSummary || 'No AI review notes yet'

  return {
    confidence,
    subtitle,
  }
}
