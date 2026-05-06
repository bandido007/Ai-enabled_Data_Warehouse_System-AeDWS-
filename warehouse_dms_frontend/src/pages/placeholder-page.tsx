import { Clock3 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/common/empty-state'
import { PageHeader } from '@/components/common/page-header'

export function PlaceholderPage({ title }: { title: string }) {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      <PageHeader title={title} subtitle={t('placeholders.description')} />
      <EmptyState
        icon={<Clock3 className="h-6 w-6" />}
        title={t('placeholders.title')}
        description={t('placeholders.description')}
      />
    </div>
  )
}
