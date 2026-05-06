import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'

const statusVariantMap: Record<string, 'warning' | 'success' | 'error' | 'info' | 'neutral'> = {
  PENDING_STAFF: 'warning',
  PENDING_MANAGER: 'warning',
  PENDING_CEO: 'warning',
  APPROVED: 'success',
  REJECTED: 'error',
  CORRECTION_NEEDED: 'error',
  DRAFT: 'neutral',
}

export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation()

  return (
    <Badge dot variant={statusVariantMap[status] ?? 'neutral'}>
      {t(`status.${status}`)}
    </Badge>
  )
}
