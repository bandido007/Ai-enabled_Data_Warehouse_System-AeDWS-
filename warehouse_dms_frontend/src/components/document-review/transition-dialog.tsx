import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface TransitionDialogProps {
  action: string | null
  open: boolean
  loading?: boolean
  reasonRequired?: boolean
  onClose: () => void
  onSubmit: (reason: string) => void
}

interface FormValues {
  reason: string
}

export function TransitionDialog({
  action,
  open,
  loading = false,
  reasonRequired = false,
  onClose,
  onSubmit,
}: TransitionDialogProps) {
  const { t } = useTranslation()
  const form = useForm<FormValues>({ defaultValues: { reason: '' } })

  useEffect(() => {
    if (open) {
      form.reset({ reason: '' })
    }
  }, [form, open])

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('documentReview.actions.dialogTitle', {
              action: action ? t(`documentReview.actions.${action}`) : '',
            })}
          </DialogTitle>
          <DialogDescription>{t('documentReview.actions.dialogDescription')}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit((values) => {
            onSubmit(values.reason)
          })}
        >
          <div className="space-y-2">
            <Label htmlFor="reason">{t('documentReview.actions.reason')}</Label>
            <Input
              id="reason"
              {...form.register('reason', {
                required: reasonRequired ? t('documentReview.actions.reason') : false,
              })}
              placeholder={t('documentReview.actions.reasonPlaceholder')}
            />
            {form.formState.errors.reason ? (
              <p className="text-sm text-semantic-error">{String(form.formState.errors.reason.message)}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? t('common.loading') : t('documentReview.actions.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
