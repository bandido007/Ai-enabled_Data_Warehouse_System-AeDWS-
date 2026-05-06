import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'

function getConfidenceTier(confidence?: number | null) {
  if (confidence === null || confidence === undefined) {
    return { labelKey: 'confidence.none', variant: 'neutral' as const }
  }

  if (confidence >= 0.85) {
    return { labelKey: 'confidence.high', variant: 'success' as const }
  }

  if (confidence >= 0.6) {
    return { labelKey: 'confidence.medium', variant: 'warning' as const }
  }

  return { labelKey: 'confidence.low', variant: 'error' as const }
}

export function ConfidenceBadge({ confidence }: { confidence?: number | null }) {
  const { t } = useTranslation()
  const tier = getConfidenceTier(confidence)

  return <Badge variant={tier.variant}>{t(tier.labelKey)}</Badge>
}
