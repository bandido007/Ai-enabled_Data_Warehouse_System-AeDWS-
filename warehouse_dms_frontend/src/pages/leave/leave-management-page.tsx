/**
 * Leave Management Page — Manager & CEO
 *
 * Shows ALL leave applications scoped to the user's tenant/authority.
 * Each row exposes the applicant's balance snapshot so approvers can see
 * context (annual days, days used before this request, days remaining).
 * Emergency requests are highlighted in amber.
 *
 * Approve / Reject with an optional comment triggers the transition
 * endpoint.  CEO also sees manager-approved records awaiting final sign-off.
 */

import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock,
  Filter,
  XCircle,
} from 'lucide-react'
import { useState } from 'react'

import { PageHeader } from '@/components/common/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { useLeaveApplicationsQuery, useLeaveTransitionMutation } from '@/lib/queries'
import { useAuth } from '@/hooks/use-auth'
import type { LeaveApplication } from '@/types/api'

// ── helpers ────────────────────────────────────────────────────────────────

function statusColor(
  status: string,
): 'success' | 'neutral' | 'error' | 'warning' {
  if (status.includes('APPROVED')) return 'success'
  if (status.includes('REJECTED')) return 'error'
  if (status === 'CANCELLED') return 'neutral'
  return 'warning'
}

function StatusIcon({ status }: { status: string }) {
  if (status.includes('APPROVED'))
    return <CheckCircle2 className="h-4 w-4 text-green-500" />
  if (status.includes('REJECTED'))
    return <XCircle className="h-4 w-4 text-red-500" />
  if (status === 'CANCELLED')
    return <XCircle className="h-4 w-4 text-muted-foreground" />
  return <Clock className="h-4 w-4 text-yellow-500" />
}

// ── Balance pill ───────────────────────────────────────────────────────────

function BalancePill({ app }: { app: LeaveApplication }) {
  const remaining = app.daysRemainingBefore
  const color = remaining <= 0 ? 'text-red-500' : remaining <= 5 ? 'text-yellow-500' : 'text-green-600'
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>Alloc: {app.annualDays}d</span>
      <span className="text-border">|</span>
      <span>Used: {app.daysUsedBefore}d</span>
      <span className="text-border">|</span>
      <span className={`font-medium ${color}`}>Bal: {app.daysRemainingBefore}d</span>
    </div>
  )
}

// ── Transition dialog ──────────────────────────────────────────────────────

interface TransitionDialogProps {
  app: LeaveApplication | null
  onClose: () => void
}

function TransitionDialog({ app, onClose }: TransitionDialogProps) {
  const { toast } = useToast()
  const mutation = useLeaveTransitionMutation(app?.id)
  const [action, setAction] = useState<'approve' | 'reject'>('approve')
  const [comment, setComment] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await mutation.mutateAsync({ action, comment })
      toast({
        title: `Application ${action}d`,
        description: `${app?.applicantFullName}'s request has been ${action}d.`,
      })
      onClose()
      setComment('')
      setAction('approve')
    } catch {
      toast({ title: 'Action failed', variant: 'destructive' })
    }
  }

  if (!app) return null

  return (
    <Dialog open={Boolean(app)} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Review Leave Request</DialogTitle>
        </DialogHeader>

        {/* Applicant summary */}
        <div className="rounded-lg border p-3 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-medium">{app.applicantFullName}</span>
            {app.isEmergency && (
              <Badge
                variant="warning"
                className="text-[10px]"
              >
                <AlertTriangle className="mr-1 h-3 w-3" />
                Emergency
              </Badge>
            )}
          </div>
          <div className="text-muted-foreground">
            {app.leaveTypeDisplay} · {app.startDate} → {app.endDate} ({app.daysRequested} working days)
          </div>
          {app.reason && (
            <div className="rounded bg-muted px-2 py-1.5 text-xs">
              <span className="font-medium">Reason: </span>{app.reason}
            </div>
          )}
          <BalancePill app={app} />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Decision</Label>
            <Select
              value={action}
              onValueChange={(v) => setAction(v as 'approve' | 'reject')}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="approve">Approve</SelectItem>
                <SelectItem value="reject">Reject</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Comment {action === 'reject' && <span className="text-red-500">*</span>}</Label>
            <Textarea
              className="mt-1"
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={
                action === 'approve' ? 'Optional approval note…' : 'Reason for rejection…'
              }
              required={action === 'reject'}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!!mutation.isPending}
              variant={action === 'reject' ? 'destructive' : 'primary'}
            >
              {mutation.isPending
                ? 'Saving…'
                : action === 'approve'
                ? 'Approve Application'
                : 'Reject Application'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Summary metrics ────────────────────────────────────────────────────────

function SummaryMetrics({ apps }: { apps: LeaveApplication[] }) {
  const pending = apps.filter((a) => a.status === 'PENDING').length
  const pendingMgr = apps.filter((a) => a.status === 'MANAGER_APPROVED').length
  const emergency = apps.filter((a) => a.isEmergency && a.status === 'PENDING').length
  const approved = apps.filter(
    (a) => a.status === 'CEO_APPROVED' || a.status === 'MANAGER_APPROVED',
  ).length

  return (
    <div className="grid gap-4 sm:grid-cols-4">
      {[
        { label: 'Pending Review', value: pending, color: 'text-yellow-500' },
        { label: 'Manager Approved', value: pendingMgr, color: 'text-blue-500' },
        { label: 'Emergency Requests', value: emergency, color: 'text-red-500' },
        { label: 'Total Approved', value: approved, color: 'text-green-600' },
      ].map(({ label, value, color }) => (
        <Card key={label}>
          <CardContent className="p-4 text-center">
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-xs text-muted-foreground mt-1 uppercase tracking-wide">
              {label}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ── Filter bar ─────────────────────────────────────────────────────────────

interface Filters {
  status: string
  leaveType: string
}

function FilterBar({
  filters,
  onChange,
}: {
  filters: Filters
  onChange: (f: Filters) => void
}) {
  return (
    <div className="flex flex-wrap gap-3 items-center">
      <Filter className="h-4 w-4 text-muted-foreground" />
      <Select
        value={filters.status || 'all'}
        onValueChange={(v) => onChange({ ...filters, status: v === 'all' ? '' : v })}
      >
        <SelectTrigger className="h-8 w-44 text-xs">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="PENDING">Pending</SelectItem>
          <SelectItem value="MANAGER_APPROVED">Manager Approved</SelectItem>
          <SelectItem value="CEO_APPROVED">CEO Approved</SelectItem>
          <SelectItem value="MANAGER_REJECTED">Manager Rejected</SelectItem>
          <SelectItem value="CEO_REJECTED">CEO Rejected</SelectItem>
          <SelectItem value="CANCELLED">Cancelled</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={filters.leaveType || 'all'}
        onValueChange={(v) => onChange({ ...filters, leaveType: v === 'all' ? '' : v })}
      >
        <SelectTrigger className="h-8 w-44 text-xs">
          <SelectValue placeholder="All types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All types</SelectItem>
          <SelectItem value="ANNUAL">Annual</SelectItem>
          <SelectItem value="SICK">Sick</SelectItem>
          <SelectItem value="EMERGENCY">Emergency</SelectItem>
          <SelectItem value="BEREAVEMENT">Bereavement</SelectItem>
          <SelectItem value="MATERNITY">Maternity</SelectItem>
          <SelectItem value="PATERNITY">Paternity</SelectItem>
          <SelectItem value="OTHER">Other</SelectItem>
        </SelectContent>
      </Select>
      {(filters.status || filters.leaveType) && (
        <Button
          size="sm"
          variant="ghost"
          className="h-8 text-xs"
          onClick={() => onChange({ status: '', leaveType: '' })}
        >
          Clear
        </Button>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export function LeaveManagementPage() {
  const { primaryRole } = useAuth()
  const [selected, setSelected] = useState<LeaveApplication | null>(null)
  const [filters, setFilters] = useState<Filters>({ status: '', leaveType: '' })

  const queryParams: Record<string, unknown> = {}
  if (filters.status) queryParams.status = filters.status
  if (filters.leaveType) queryParams.leaveType = filters.leaveType

  const appsQuery = useLeaveApplicationsQuery(queryParams, true)
  const apps = appsQuery.data?.data ?? []

  // Determine which apps CAN be actioned by this role
  const canAction = (app: LeaveApplication) => {
    if (primaryRole === 'CEO') {
      return app.status === 'PENDING' || app.status === 'MANAGER_APPROVED'
    }
    return app.status === 'PENDING'
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leave Management"
        subtitle={
          primaryRole === 'CEO'
            ? 'Review and approve all leave applications for your organisation.'
            : 'Review and approve leave requests from your team.'
        }
      />

      <SummaryMetrics apps={apps} />

      <Card>
        <CardHeader className="border-b px-5 py-4 flex-row items-center justify-between">
          <CardTitle className="text-base">All Applications</CardTitle>
          <FilterBar filters={filters} onChange={setFilters} />
        </CardHeader>
        <CardContent className="p-0">
          {appsQuery.isLoading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded" />
              ))}
            </div>
          ) : apps.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-sm text-muted-foreground">
              <CalendarDays className="h-8 w-8 opacity-30" />
              No applications match current filters
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2.5 pl-5 pr-3 text-left">Applicant</th>
                    <th className="py-2.5 pr-3 text-left">Type / Dates</th>
                    <th className="py-2.5 pr-3 text-center">Days</th>
                    <th className="py-2.5 pr-3 text-left">Balance</th>
                    <th className="py-2.5 pr-3 text-left">Status</th>
                    <th className="py-2.5 pr-5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {apps.map((app) => (
                    <tr
                      key={app.id}
                      className={`border-b last:border-0 text-sm transition-colors hover:bg-muted/30 ${
                        app.isEmergency && app.status === 'PENDING'
                          ? 'bg-yellow-50/50 dark:bg-yellow-950/20'
                          : ''
                      }`}
                    >
                      <td className="py-3 pl-5 pr-3">
                        <div className="font-medium">{app.applicantFullName}</div>
                        <div className="text-xs text-muted-foreground">
                          @{app.applicantUsername}
                        </div>
                      </td>
                      <td className="py-3 pr-3">
                        <div className="font-medium">{app.leaveTypeDisplay}</div>
                        <div className="text-xs text-muted-foreground">
                          {app.startDate} → {app.endDate}
                        </div>
                      </td>
                      <td className="py-3 pr-3 text-center font-mono">
                        {app.daysRequested}d
                      </td>
                      <td className="py-3 pr-3">
                        <BalancePill app={app} />
                      </td>
                      <td className="py-3 pr-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusIcon status={app.status} />
                          <Badge
                            variant={statusColor(app.status)}
                            className="text-[11px]"
                          >
                            {app.statusDisplay}
                          </Badge>
                          {app.isEmergency && (
                            <Badge
                              variant="warning"
                              className="text-[10px]"
                            >
                              <AlertTriangle className="mr-1 h-3 w-3" />
                              Emergency
                            </Badge>
                          )}
                        </div>
                        {(app.managerComment || app.ceoComment) && (
                          <div className="mt-1 text-xs text-muted-foreground truncate max-w-[180px]">
                            {app.managerComment || app.ceoComment}
                          </div>
                        )}
                      </td>
                      <td className="py-3 pr-5 text-right">
                        {canAction(app) ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="text-xs"
                            onClick={() => setSelected(app)}
                          >
                            Review
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <TransitionDialog app={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
