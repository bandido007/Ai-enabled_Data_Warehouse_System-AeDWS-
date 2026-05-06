import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import type { AvailableTransition } from '@/types/api'
import { getActionVariant } from '@/lib/document-review'

import { TransitionDialog } from './transition-dialog'

interface ReviewActionBarProps {
  transitions: AvailableTransition[]
  loading?: boolean
  onSubmit: (action: string, reason: string) => void
}

export function ReviewActionBar({ transitions, loading = false, onSubmit }: ReviewActionBarProps) {
  const { t } = useTranslation()
  const [activeAction, setActiveAction] = useState<AvailableTransition | null>(null)

  const orderedTransitions = useMemo(() => {
    const order = ['reject', 'send_back', 'send_back_to_staff', 'send_back_to_manager', 'resubmit', 'confirm', 'escalate', 'approve', 'final_approve']
    return [...transitions].sort((left, right) => order.indexOf(left.action) - order.indexOf(right.action))
  }, [transitions])

  return (
    <>
      <div className="sticky bottom-0 mt-auto border-t border-border bg-surface/95 px-4 py-3 backdrop-blur">
        {orderedTransitions.length ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {orderedTransitions.map((transition) => (
              <Button
                key={`${transition.action}-${transition.toState}`}
                type="button"
                variant={getActionVariant(transition.action)}
                onClick={() => setActiveAction(transition)}
              >
                {t(`documentReview.actions.${transition.action}`)}
              </Button>
            ))}
          </div>
        ) : (
          <div className="text-right text-sm text-text-secondary">{t('documentReview.actions.none')}</div>
        )}
      </div>
      <TransitionDialog
        open={Boolean(activeAction)}
        action={activeAction?.action ?? null}
        loading={loading}
        reasonRequired={Boolean(activeAction?.reasonRequired)}
        onClose={() => setActiveAction(null)}
        onSubmit={(reason) => {
          if (activeAction) {
            onSubmit(activeAction.action, reason)
          }
          setActiveAction(null)
        }}
      />
    </>
  )
}
