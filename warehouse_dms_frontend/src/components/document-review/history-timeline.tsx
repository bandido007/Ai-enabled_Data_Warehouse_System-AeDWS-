import {
  CheckCircle2,
  FileCheck2,
  FileWarning,
  GitBranch,
  PencilLine,
  RotateCcw,
  Send,
  XCircle,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { UserAvatar } from '@/components/common/user-avatar'
import type { WorkflowTransition } from '@/types/api'
import { getDisplayActorName } from '@/lib/document-review'
import { formatRelativeTime } from '@/lib/utils'

const iconMap = {
  approve: FileCheck2,
  confirm: CheckCircle2,
  correct_ai: PencilLine,
  correct_fields: PencilLine,
  final_approve: CheckCircle2,
  reclassify: GitBranch,
  reject: XCircle,
  resubmit: RotateCcw,
  send_back: FileWarning,
  submit: Send,
}

export function HistoryTimeline({ transitions }: { transitions: WorkflowTransition[] }) {
  const { t, i18n } = useTranslation()

  if (!transitions.length) {
    return <div className="rounded-md border border-dashed border-border px-4 py-6 text-sm text-text-secondary">{t('documentReview.history.empty')}</div>
  }

  return (
    <div className="space-y-4">
      {transitions.map((transition) => {
        const Icon = iconMap[transition.action as keyof typeof iconMap] ?? GitBranch
        const actionLabel = t(`documentReview.timeline.${transition.action}`)
        return (
          <div key={transition.id} className="relative flex gap-3 pl-2 before:absolute before:left-[18px] before:top-10 before:h-[calc(100%-18px)] before:w-px before:bg-border last:before:hidden">
            <div className="relative z-10 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-brand-teal">
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1 rounded-md border border-border bg-canvas px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <UserAvatar
                      size="sm"
                      user={{
                        firstName: transition.actor?.firstName,
                        lastName: transition.actor?.lastName,
                        username: transition.actor?.username,
                      }}
                    />
                    <div>
                      <div className="text-sm font-medium text-text-primary">{getDisplayActorName(transition)}</div>
                      <div className="text-xs text-text-secondary">{actionLabel === `documentReview.timeline.${transition.action}` ? t('documentReview.timeline.default') : actionLabel}</div>
                    </div>
                  </div>
                  {transition.reason ? (
                    <blockquote className="mt-3 border-l-[3px] border-brand-teal pl-3 text-sm text-text-secondary">
                      “{transition.reason}”
                    </blockquote>
                  ) : null}
                </div>
                <div className="font-mono text-[11px] uppercase tracking-[0.05em] text-text-tertiary">
                  {formatRelativeTime(transition.createdDate, i18n.language)}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
