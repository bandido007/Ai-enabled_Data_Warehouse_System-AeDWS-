import { useTranslation } from 'react-i18next'

import type { WorkflowTransition } from '@/types/api'
import { formatRelativeTime } from '@/lib/utils'
import { getDisplayActorName } from '@/lib/document-review'

export function MobileTransitionTimeline({ transitions }: { transitions: WorkflowTransition[] }) {
  const { t, i18n } = useTranslation()

  return (
    <div className="space-y-3">
      {transitions.map((transition) => {
        const label = t(`documentReview.timeline.${transition.action}`)
        return (
          <div key={transition.id} className="rounded-2xl border border-border bg-surface px-4 py-3 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-text-primary">
                  {label === `documentReview.timeline.${transition.action}` ? t('documentReview.timeline.default') : label}
                </div>
                <div className="text-xs text-text-secondary">{getDisplayActorName(transition)}</div>
              </div>
              <div className="text-[11px] text-text-tertiary">{formatRelativeTime(transition.createdDate, i18n.language)}</div>
            </div>
            {transition.reason ? <p className="mt-2 text-sm text-text-secondary">{transition.reason}</p> : null}
          </div>
        )
      })}
    </div>
  )
}
