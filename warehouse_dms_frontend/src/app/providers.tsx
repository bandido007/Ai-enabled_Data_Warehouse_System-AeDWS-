import { AppErrorBoundary } from '@/components/common/app-error-boundary'
import { ApiConnectionBanner } from '@/components/layout/api-connection-banner'
import { QueryClientProvider } from '@tanstack/react-query'
import { useEffect, type ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'

import { Toaster } from '@/components/ui/toaster'
import i18n from '@/i18n'
import { authStore } from '@/stores/auth-store'

import { queryClient } from './query-client'

function LanguageSync() {
  const profile = authStore((state) => state.profile)

  useEffect(() => {
    if (profile?.preferredLanguage) {
      void i18n.changeLanguage(profile.preferredLanguage)
    }
  }, [profile?.preferredLanguage])

  return null
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <AppErrorBoundary>
          <LanguageSync />
          <ApiConnectionBanner />
          {children}
          <Toaster />
        </AppErrorBoundary>
      </QueryClientProvider>
    </I18nextProvider>
  )
}
