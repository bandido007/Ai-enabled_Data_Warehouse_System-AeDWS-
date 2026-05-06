import { AlertTriangle, Bell } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/common/empty-state'
import { PageHeader } from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'
import { saveNotificationPreferences, useNotificationPreferencesQuery } from '@/lib/queries'
import {
  flattenPreferences,
  getNotificationEventLabel,
  pivotPreferences,
  type NotificationPreferenceRow,
} from '@/lib/notification-preferences'

export function NotificationPreferencesPage() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const preferencesQuery = useNotificationPreferencesQuery(true)
  const [draft, setDraft] = useState<NotificationPreferenceRow[] | null>(null)
  const originalRows = useMemo(() => pivotPreferences(preferencesQuery.data ?? []), [preferencesQuery.data])
  const rows = draft ?? originalRows

  const saveMutation = useMutation({
    mutationFn: () => saveNotificationPreferences(flattenPreferences(rows)),
    onSuccess: async (nextPreferences) => {
      queryClient.setQueryData(['notification-preferences'], nextPreferences)
      setDraft(null)
      toast({ title: t('notificationPreferences.saved') })
    },
    onError: (error) => {
      toast({
        title: t('notificationPreferences.saveError'),
        description: error instanceof Error ? error.message : t('notificationPreferences.saveError'),
        variant: 'destructive',
      })
    },
  })

  const isDirty = useMemo(() => {
    return JSON.stringify(originalRows) !== JSON.stringify(rows)
  }, [originalRows, rows])

  function toggleCell(eventType: string, channel: 'DASHBOARD' | 'EMAIL' | 'SMS', checked: boolean) {
    setDraft((current) =>
      (current ?? rows).map((row) =>
        row.eventType === eventType
          ? {
              ...row,
              [channel]: channel === 'DASHBOARD' ? true : checked,
            }
          : row
      )
    )
  }

  function handleReset() {
    setDraft(null)
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('notificationPreferences.title')} subtitle={t('notificationPreferences.subtitle')} />

      <Card>
        <CardContent className="p-0">
          {preferencesQuery.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 7 }).map((_, index) => <Skeleton key={index} className="h-12 rounded-none" />)}
            </div>
          ) : rows.length ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('notificationPreferences.columns.event')}</TableHead>
                    <TableHead>{t('notificationPreferences.columns.dashboard')}</TableHead>
                    <TableHead>{t('notificationPreferences.columns.email')}</TableHead>
                    <TableHead>
                      <div className="flex items-center gap-2">
                        <span>{t('notificationPreferences.columns.sms')}</span>
                        <span title={t('notificationPreferences.smsHint')}>
                          <AlertTriangle className="h-4 w-4 text-semantic-warning" />
                        </span>
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.eventType}>
                      <TableCell className="font-medium text-text-primary">{getNotificationEventLabel(row.eventType, t)}</TableCell>
                      <TableCell>
                        <Switch checked={row.DASHBOARD} disabled title={t('notificationPreferences.dashboardHint')} />
                      </TableCell>
                      <TableCell>
                        <Switch checked={row.EMAIL} onCheckedChange={(checked) => toggleCell(row.eventType, 'EMAIL', checked)} />
                      </TableCell>
                      <TableCell>
                        <Switch checked={row.SMS} onCheckedChange={(checked) => toggleCell(row.eventType, 'SMS', checked)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex justify-end gap-3 border-t border-border px-5 py-4">
                <Button type="button" variant="secondary" onClick={handleReset} disabled={!isDirty || saveMutation.isPending}>
                  {t('notificationPreferences.reset')}
                </Button>
                <Button type="button" onClick={() => saveMutation.mutate()} disabled={!isDirty || saveMutation.isPending}>
                  {t('notificationPreferences.save')}
                </Button>
              </div>
            </>
          ) : (
            <div className="p-4">
              <EmptyState icon={<Bell className="h-6 w-6" />} title={t('notificationPreferences.empty.title')} description={t('notificationPreferences.empty.description')} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
