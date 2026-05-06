import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'

const variantMap: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  LOW: 'success',
  MEDIUM: 'warning',
  HIGH: 'error',
}

export function RiskBadge({ riskCategory }: { riskCategory?: string | null }) {
  const { t } = useTranslation()
  const normalized = riskCategory?.toUpperCase() || 'none'

  return (
    <Badge dot variant={variantMap[normalized] ?? 'neutral'}>
      {normalized === 'none' ? t('regulator.risk.none') : t(`regulator.risk.${normalized}`)}
    </Badge>
  )
}
