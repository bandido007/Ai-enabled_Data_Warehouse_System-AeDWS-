import { useEffect } from 'react'
import { AlertTriangle, WifiOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { apiStatusStore } from '@/stores/api-status-store'

export function ApiConnectionBanner() {
  const { t } = useTranslation()
  const online = apiStatusStore((state) => state.online)
  const reachable = apiStatusStore((state) => state.reachable)
  const message = apiStatusStore((state) => state.message)
  const setOnline = apiStatusStore((state) => state.setOnline)

  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [setOnline])

  if (online && reachable) {
    return null
  }

  return (
    <div className="sticky top-0 z-[60] border-b border-semantic-warning bg-semantic-warning-bg px-4 py-2 text-sm text-semantic-warning">
      <div className="mx-auto flex max-w-shell items-center gap-2">
        {online ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <WifiOff className="h-4 w-4 shrink-0" />}
        <span>
          {online
            ? t('errors.apiUnreachable', { message: message || t('errors.apiUnreachableFallback') })
            : t('errors.offline')}
        </span>
      </div>
    </div>
  )
}
