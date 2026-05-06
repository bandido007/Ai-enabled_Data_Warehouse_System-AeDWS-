import { Bell } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { markAllNotificationsRead, markNotificationRead, useNotificationsQuery } from '@/lib/queries'

export function NotificationDropdown({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const notificationsQuery = useNotificationsQuery(enabled)

  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const markAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const notifications = notificationsQuery.data ?? []

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative inline-flex h-8 w-8 items-center justify-center rounded-sm text-text-secondary transition-standard hover:bg-border-subtle hover:text-text-primary"
          aria-label={t('common.openNotifications')}
        >
          <Bell className="h-4 w-4" />
          {notifications.length ? (
            <span className="absolute -right-1 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-brand-terracotta px-1 text-[10px] font-semibold text-surface">
              {notifications.length}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>{t('notifications.unread')}</span>
          <button
            type="button"
            onClick={() => markAllMutation.mutate()}
            className="text-[11px] font-medium normal-case tracking-normal text-brand-teal"
          >
            {t('notifications.markAllRead')}
          </button>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.length ? (
          notifications.map((notification) => (
            <DropdownMenuItem
              key={notification.id}
              className="flex flex-col items-start gap-1"
              onSelect={() => {
                markReadMutation.mutate(notification.id)
                if (notification.relatedDocumentId) {
                  navigate(`/documents/${notification.relatedDocumentId}`)
                } else {
                  navigate('/notifications')
                }
              }}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="text-sm font-medium text-text-primary">{notification.subject}</span>
                <Badge variant="info">{t('notifications.unread')}</Badge>
              </div>
              <span className="line-clamp-2 text-xs text-text-secondary">{notification.body}</span>
            </DropdownMenuItem>
          ))
        ) : (
          <div className="px-2 py-6 text-center text-sm text-text-secondary">{t('notifications.empty')}</div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
