/**
 * Leave Page — Staff, Manager, CEO
 *
 * Shows:
 *  • A live leave balance card (annual allocation, used, remaining) — values
 *    automatically fetched from the backend, never entered manually.
 *  • An "Apply for Leave" button that takes the employee to the standard
 *    Staff Permission Request Form with the Leave type pre-selected.
 *  • A history table of the user's own leave applications.
 *
 * Per the system requirements leave balance details (days allocated, used,
 * remaining) are calculated server-side and rendered here read-only.
 */

import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  PlusCircle,
  XCircle,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { PageHeader } from '@/components/common/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import {
  useCancelLeaveApplicationMutation,
  useLeaveApplicationsQuery,
  useLeaveBalanceQuery,
} from '@/lib/queries'

// ── helpers ────────────────────────────────────────────────────────────────


function statusColor(status: string): 'success' | 'neutral' | 'error' | 'warning' {
  if (status.includes('APPROVED')) return 'success'
  if (status.includes('REJECTED')) return 'error'
  if (status === 'CANCELLED') return 'neutral'
  return 'warning'
}

function StatusIcon({ status }: { status: string }) {
  if (status.includes('APPROVED')) return <CheckCircle2 className="h-4 w-4 text-green-500" />
  if (status.includes('REJECTED')) return <XCircle className="h-4 w-4 text-red-500" />
  if (status === 'CANCELLED') return <XCircle className="h-4 w-4 text-muted-foreground" />
  return <Clock className="h-4 w-4 text-yellow-500" />
}

// ── Balance strip ──────────────────────────────────────────────────────────

function BalanceStrip() {
  const { data: balance, isLoading } = useLeaveBalanceQuery()

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    )
  }

  if (!balance) return null

  const usedPct = balance.annualDays > 0 ? (balance.daysUsed / balance.annualDays) * 100 : 0
  const barColor =
    usedPct >= 100 ? 'bg-red-500' : usedPct >= 75 ? 'bg-yellow-500' : 'bg-green-500'

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="h-4 w-4" />
          Leave Balance — {balance.year}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-3">
          {/* Allocated */}
          <div className="rounded-lg border p-3 text-center">
            <div className="text-2xl font-bold text-foreground">{balance.annualDays}</div>
            <div className="text-xs text-muted-foreground mt-1 uppercase tracking-wide">
              Annual Days
            </div>
          </div>
          {/* Used */}
          <div className="rounded-lg border p-3 text-center">
            <div className="text-2xl font-bold text-orange-500">{balance.daysUsed}</div>
            <div className="text-xs text-muted-foreground mt-1 uppercase tracking-wide">Days Used</div>
          </div>
          {/* Remaining */}
          <div className="rounded-lg border p-3 text-center">
            <div
              className={`text-2xl font-bold ${
                balance.daysRemaining === 0 ? 'text-red-500' : 'text-green-600'
              }`}
            >
              {balance.daysRemaining}
            </div>
            <div className="text-xs text-muted-foreground mt-1 uppercase tracking-wide">
              Days Remaining
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Used {Math.round(usedPct)}%</span>
            <span>{balance.daysUsed} / {balance.annualDays} days</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${barColor}`}
              style={{ width: `${Math.min(usedPct, 100)}%` }}
            />
          </div>
        </div>

        {balance.daysRemaining === 0 && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 p-2 text-xs text-yellow-800 dark:text-yellow-300">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            You have used all your annual leave days. Emergency applications can still be submitted
            and will be reviewed by your manager.
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

export function LeavePage() {
  const navigate = useNavigate()
  const cancelMutation = useCancelLeaveApplicationMutation()
  const { toast } = useToast()
  const appsQuery = useLeaveApplicationsQuery({}, true)
  const apps = appsQuery.data?.data ?? []

  const handleCancel = async (id: number) => {
    try {
      await cancelMutation.mutateAsync(id)
      toast({ title: 'Leave application cancelled' })
    } catch {
      toast({ title: 'Cancellation failed', variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leave Applications"
        subtitle="Your leave balance is calculated automatically. Use Apply for Leave to submit a request through the permission workflow."
        actions={
          <Button onClick={() => navigate('/forms/staff-permission?leaveType=annual')} size="sm">
            <PlusCircle className="mr-1.5 h-4 w-4" />
            Apply for Leave
          </Button>
        }
      />

      {/* Balance strip — always visible */}
      <BalanceStrip />

      {/* History table */}
      <Card>
        <CardHeader className="border-b px-5 py-4">
          <CardTitle className="text-base">My Applications</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {appsQuery.isLoading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded" />
              ))}
            </div>
          ) : apps.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-12 text-sm text-muted-foreground">
              <CalendarDays className="h-8 w-8 opacity-30" />
              <div className="text-center">
                <p>No leave applications yet.</p>
                <p className="mt-1 text-xs">Click <strong>Apply for Leave</strong> above to submit your first request.</p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => navigate('/forms/staff-permission?leaveType=annual')}
              >
                <ArrowRight className="mr-1.5 h-4 w-4" />
                Go to Permission Request Form
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2.5 pl-5 pr-3 text-left">Type / Dates</th>
                    <th className="py-2.5 pr-3 text-center">Days</th>
                    <th className="py-2.5 pr-3 text-left">Status</th>
                    <th className="py-2.5 pr-3 text-left">Comments</th>
                    <th className="py-2.5 pr-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="pl-5">
                  {apps.map((app) => (
                    <tr key={app.id} className="border-b last:border-0 text-sm">
                      <td className="py-3 pl-5 pr-3">
                        <div className="font-medium">{app.leaveTypeDisplay}</div>
                        <div className="text-xs text-muted-foreground">
                          {app.startDate} → {app.endDate}
                        </div>
                      </td>
                      <td className="py-3 pr-3 text-center font-mono">{app.daysRequested}d</td>
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-1.5">
                          <StatusIcon status={app.status} />
                          <Badge variant={statusColor(app.status)} className="text-[11px]">
                            {app.statusDisplay}
                          </Badge>
                          {app.isEmergency && (
                            <Badge
                              variant="warning"
                              className="text-[10px]"
                            >
                              Emergency
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-3 text-xs text-muted-foreground max-w-[200px] truncate">
                        {app.managerComment || app.ceoComment || app.reason || '—'}
                      </td>
                      <td className="py-3 pr-5 text-right">
                        {app.status === 'PENDING' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs text-red-500 hover:text-red-600"
                            onClick={() => handleCancel(app.id)}
                            disabled={cancelMutation.isPending}
                          >
                            Cancel
                          </Button>
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
    </div>
  )
}
