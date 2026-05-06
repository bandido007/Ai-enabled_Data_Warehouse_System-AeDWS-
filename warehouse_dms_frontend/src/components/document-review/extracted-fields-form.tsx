import { useEffect, useMemo, useState } from 'react'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import type { DocumentRecord, DocumentTypeMetadata } from '@/types/api'
import { getCorrectedFieldKeys, getExtractedFieldEntries } from '@/lib/document-review'

interface ExtractedFieldsFormProps {
  document: DocumentRecord
  documentTypes: DocumentTypeMetadata[]
  reclassifying?: boolean
  takingLonger?: boolean
  onManualRefresh: () => void
  onFieldCommit: (field: string, value: string) => Promise<void>
  onReclassify: (nextTypeId: string) => Promise<void>
}

export function ExtractedFieldsForm({
  document,
  documentTypes,
  reclassifying = false,
  takingLonger = false,
  onManualRefresh,
  onFieldCommit,
  onReclassify,
}: ExtractedFieldsFormProps) {
  const { t } = useTranslation()
  const currentTypeId = document.aiClassification || document.documentTypeId
  const fieldEntries = useMemo(() => getExtractedFieldEntries(document.aiExtractedFields), [document.aiExtractedFields])
  const correctedFields = useMemo(() => getCorrectedFieldKeys(document.transitions), [document.transitions])
  const [savingFieldKey, setSavingFieldKey] = useState<string | null>(null)
  const [optimisticSavedFieldKeys, setOptimisticSavedFieldKeys] = useState<Set<string>>(new Set())
  const [pendingTypeId, setPendingTypeId] = useState<string | null>(null)

  const form = useForm<Record<string, string>>({
    defaultValues: Object.fromEntries(fieldEntries.map((entry) => [entry.key, entry.value])),
  })

  useEffect(() => {
    form.reset(Object.fromEntries(fieldEntries.map((entry) => [entry.key, entry.value])))
  }, [fieldEntries, form])

  const savedFieldKeys = useMemo(
    () => new Set([...correctedFields, ...optimisticSavedFieldKeys]),
    [correctedFields, optimisticSavedFieldKeys]
  )

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{t('documentReview.fields.typeLabel')}</Label>
        <Select
          value={currentTypeId}
          onValueChange={(value) => {
            if (value !== currentTypeId) {
              setPendingTypeId(value)
            }
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder={t('documentReview.fields.typePlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {documentTypes.map((type) => (
              <SelectItem key={type.id} value={type.id}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {reclassifying ? (
        <div className="space-y-3 rounded-md border border-border bg-canvas p-4">
          <div className="text-sm font-medium text-text-primary">{t('documentReview.fields.reclassifying')}</div>
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-14 rounded-md" />
          ))}
          {takingLonger ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning bg-semantic-warning-bg px-3 py-2 text-sm text-semantic-warning">
              <span>{t('documentReview.fields.takingLonger')}</span>
              <Button type="button" size="sm" variant="secondary" onClick={onManualRefresh}>
                {t('documentReview.fields.refresh')}
              </Button>
            </div>
          ) : null}
        </div>
      ) : fieldEntries.length ? (
        <div className="space-y-4">
          {fieldEntries.map((entry) => {
            const saved = savedFieldKeys.has(entry.key)
            return (
              <div key={entry.key} className="space-y-2 rounded-md border border-border bg-canvas p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                    <span>{entry.label}</span>
                    {saved ? <span className="inline-flex h-2.5 w-2.5 rounded-full bg-brand-terracotta" title={t('documentReview.fields.corrected')} /> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {savingFieldKey === entry.key ? (
                      <span className="text-xs text-brand-terracotta">{t('documentReview.fields.saving')}</span>
                    ) : null}
                    {savingFieldKey !== entry.key && saved ? (
                      <span className="text-xs text-text-tertiary">{t('documentReview.fields.saved')}</span>
                    ) : null}
                  </div>
                </div>
                <Input
                  {...form.register(entry.key)}
                  onBlur={async (event) => {
                    const nextValue = event.target.value
                    const originalValue = entry.value
                    if (nextValue === originalValue) {
                      return
                    }

                    setSavingFieldKey(entry.key)
                    try {
                      await onFieldCommit(entry.key, nextValue)
                      setOptimisticSavedFieldKeys((current) => new Set([...current, entry.key]))
                    } finally {
                      setSavingFieldKey(null)
                    }
                  }}
                />
              </div>
            )
          })}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border px-4 py-6 text-sm text-text-secondary space-y-1">
          <p>{t('documentReview.fields.empty')}</p>
          {document.aiSummary ? (
            <p className="text-xs text-text-tertiary">{t('documentReview.fields.emptyProcessed')}</p>
          ) : null}
        </div>
      )}

      <Dialog open={Boolean(pendingTypeId)} onOpenChange={(open) => !open && setPendingTypeId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('documentReview.reclassify.title')}</DialogTitle>
            <DialogDescription>
              {t('documentReview.reclassify.description', {
                type: documentTypes.find((type) => type.id === pendingTypeId)?.label ?? pendingTypeId,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setPendingTypeId(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              onClick={async () => {
                if (!pendingTypeId) {
                  return
                }
                await onReclassify(pendingTypeId)
                setPendingTypeId(null)
              }}
            >
              {t('documentReview.reclassify.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
