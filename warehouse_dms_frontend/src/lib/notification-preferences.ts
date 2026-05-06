import { startCase } from '@/lib/utils'
import type { PreferenceItem } from '@/types/api'

export const notificationChannels = ['DASHBOARD', 'EMAIL', 'SMS'] as const

export interface NotificationPreferenceRow {
  eventType: string
  DASHBOARD: boolean
  EMAIL: boolean
  SMS: boolean
}

export function pivotPreferences(preferences: PreferenceItem[]) {
  const grouped = new Map<string, NotificationPreferenceRow>()

  preferences.forEach((preference) => {
    const eventType = preference.eventType
    const channel = preference.channel.toUpperCase() as keyof NotificationPreferenceRow

    if (!grouped.has(eventType)) {
      grouped.set(eventType, {
        eventType,
        DASHBOARD: false,
        EMAIL: false,
        SMS: false,
      })
    }

    const row = grouped.get(eventType)
    if (row && (channel === 'DASHBOARD' || channel === 'EMAIL' || channel === 'SMS')) {
      row[channel] = preference.enabled
    }
  })

  return Array.from(grouped.values())
}

export function flattenPreferences(rows: NotificationPreferenceRow[]): PreferenceItem[] {
  return rows.flatMap((row) =>
    notificationChannels.map((channel) => ({
      eventType: row.eventType,
      channel,
      enabled: row[channel],
    }))
  )
}

export function getNotificationEventLabel(eventType: string, t: (key: string) => string) {
  const translated = t(`notificationEvents.${eventType}`)
  return translated === `notificationEvents.${eventType}` ? startCase(eventType) : translated
}
