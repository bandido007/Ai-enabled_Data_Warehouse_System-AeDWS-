import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { PanelRightOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'

import { DocumentViewer } from '@/components/document-review/document-viewer'
import { ReviewPanel } from '@/components/document-review/review-panel'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { getItem } from '@/lib/api'
import { getAvailableTransitions } from '@/lib/document-review'
import {
  getReclassifyStatus,
  reclassifyDocument,
  saveCorrectedFields,
  submitDocumentTransition,
  useDocumentQuery,
  useDocumentTransitionsQuery,
  useDocumentTypesQuery,
} from '@/lib/queries'
import type { DocumentRecord } from '@/types/api'

export function DocumentReviewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [reviewDrawerOpen, setReviewDrawerOpen] = useState(false)
  const [reclassifyPolling, setReclassifyPolling] = useState<{
    previousSignature: string
    taskId?: string
    startedAt: number
    nextTypeId: string
  } | null>(null)
  const [takingLonger, setTakingLonger] = useState(false)

  const documentQuery = useDocumentQuery(id, Boolean(id), true)
  const transitionsQuery = useDocumentTransitionsQuery(id, Boolean(id))
  const documentTypesQuery = useDocumentTypesQuery(true)

  const document = documentQuery.data
  const availableTransitions = useMemo(
    () => getAvailableTransitions(document, transitionsQuery.data),
    [document, transitionsQuery.data]
  )

  const refreshDocument = useCallback(async () => {
    if (!id) {
      return null
    }

    const latest = await getItem<DocumentRecord>(`/documents/${id}/`)
    queryClient.setQueryData(['document', id], latest)
    return latest
  }, [id, queryClient])

  const saveFieldMutation = useMutation({
    mutationFn: async ({ field, value }: { field: string; value: string }) => {
      if (!id) {
        throw new Error('Missing document id')
      }
      return saveCorrectedFields(id, { [field]: value })
    },
    onSuccess: (nextDocument) => {
      queryClient.setQueryData(['document', id], nextDocument)
      toast({ title: t('documentReview.messages.correctionSuccess') })
    },
    onError: (error) => {
      toast({
        title: t('documentReview.messages.correctionError'),
        description: error instanceof Error ? error.message : t('documentReview.messages.correctionError'),
        variant: 'destructive',
      })
    },
  })

  const transitionMutation = useMutation({
    mutationFn: async ({ action, reason }: { action: string; reason: string }) => {
      if (!id) {
        throw new Error('Missing document id')
      }
      return submitDocumentTransition(id, { action, reason })
    },
    onSuccess: async (nextDocument) => {
      queryClient.setQueryData(['document', id], nextDocument)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['document', id] }),
        queryClient.invalidateQueries({ queryKey: ['document-transitions', id] }),
        queryClient.invalidateQueries({ queryKey: ['documents'] }),
      ])
      toast({ title: t('documentReview.messages.transitionSuccess') })
    },
    onError: (error) => {
      toast({
        title: t('documentReview.messages.transitionError'),
        description: error instanceof Error ? error.message : t('documentReview.messages.transitionError'),
        variant: 'destructive',
      })
    },
  })

  const reclassifyMutation = useMutation({
    mutationFn: async (nextTypeId: string) => {
      if (!id || !document) {
        throw new Error('Missing document')
      }
      const previousSignature = JSON.stringify(document.aiExtractedFields || {})
      const result = await reclassifyDocument(id, { newTypeId: nextTypeId })
      return { ...result, previousSignature, nextTypeId }
    },
    onSuccess: ({ document: nextDocument, taskId, previousSignature, nextTypeId }) => {
      queryClient.setQueryData(['document', id], nextDocument)
      setTakingLonger(false)
      setReclassifyPolling({
        previousSignature,
        taskId,
        startedAt: Date.now(),
        nextTypeId,
      })
    },
    onError: (error) => {
      toast({
        title: t('documentReview.messages.reclassifyError'),
        description: error instanceof Error ? error.message : t('documentReview.messages.reclassifyError'),
        variant: 'destructive',
      })
    },
  })

  useEffect(() => {
    if (!reclassifyPolling || !id) {
      return
    }

    let cancelled = false
    const tick = window.setTimeout(async () => {
      if (cancelled) {
        return
      }

      try {
        let completed = false
        if (reclassifyPolling.taskId) {
          const status = await getReclassifyStatus(id, reclassifyPolling.taskId)
          completed = Boolean(status.complete) || status.status === 'complete' || status.state === 'complete'
        }

        const latest = await refreshDocument()
        const latestSignature = JSON.stringify(latest?.aiExtractedFields || {})
        if (completed || latestSignature !== reclassifyPolling.previousSignature) {
          setReclassifyPolling(null)
          setTakingLonger(false)
          toast({
            title: t('documentReview.reclassify.success', {
              type:
                documentTypesQuery.data?.find((type) => type.id === reclassifyPolling.nextTypeId)?.label ||
                reclassifyPolling.nextTypeId,
            }),
          })
          return
        }

        if (Date.now() - reclassifyPolling.startedAt > 90_000) {
          setTakingLonger(true)
          return
        }

        setReclassifyPolling((current) => (current ? { ...current } : current))
      } catch {
        if (Date.now() - reclassifyPolling.startedAt > 90_000) {
          setTakingLonger(true)
        } else {
          setReclassifyPolling((current) => (current ? { ...current } : current))
        }
      }
    }, 2_000)

    return () => {
      cancelled = true
      window.clearTimeout(tick)
    }
  }, [documentTypesQuery.data, id, reclassifyPolling, refreshDocument, t, toast])

  if (documentQuery.isLoading || documentTypesQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 rounded-md" />
        <div className="hidden gap-5 lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(360px,2fr)]">
          <Skeleton className="h-[760px] rounded-md" />
          <Skeleton className="h-[760px] rounded-md" />
        </div>
        <div className="space-y-4 lg:hidden">
          <Skeleton className="h-[420px] rounded-md" />
          <Skeleton className="h-[420px] rounded-md md:hidden" />
        </div>
      </div>
    )
  }

  if (!document || !documentTypesQuery.data) {
    return <div className="rounded-md border border-semantic-error bg-semantic-error-bg px-4 py-6 text-sm text-semantic-error">{t('documentReview.messages.loadError')}</div>
  }

  const reviewPanel = (
    <ReviewPanel
      document={document}
      documentTypes={documentTypesQuery.data}
      availableTransitions={availableTransitions}
      actionLoading={transitionMutation.isPending}
      reclassifying={reclassifyMutation.isPending || Boolean(reclassifyPolling)}
      takingLonger={takingLonger}
      onFieldCommit={async (field, value) => {
        await saveFieldMutation.mutateAsync({ field, value })
      }}
      onTransition={(action, reason) => {
        // Permission forms need the full correction form — redirect instead of inline submit
        const PERMISSION_FORM_TYPES = ['staff_permission', 'manager_permission']
        if (action === 'resubmit' && PERMISSION_FORM_TYPES.includes(document.documentTypeId)) {
          navigate(`/documents/${id}/correct`)
          return
        }
        transitionMutation.mutate({ action, reason })
      }}
      onReclassify={async (nextTypeId) => {
        await reclassifyMutation.mutateAsync(nextTypeId)
      }}
      onManualRefresh={() => {
        void refreshDocument()
      }}
    />
  )

  return (
    <div className="space-y-4">
      <div className="hidden items-center justify-between md:flex lg:hidden">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">{document.title || t('documentReview.titleFallback')}</h1>
          <p className="text-sm text-text-secondary">{t('documentReview.reviewTab')}</p>
        </div>
        <Button type="button" variant="secondary" onClick={() => setReviewDrawerOpen(true)}>
          <PanelRightOpen className="h-4 w-4" />
          {t('documentReview.viewer.openReview')}
        </Button>
      </div>

      <div className="hidden gap-5 lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(360px,2fr)]">
        <DocumentViewer fileUrl={document.fileUrl} formFields={document.aiExtractedFields as Record<string, string>} />
        {reviewPanel}
      </div>

      <div className="hidden gap-4 md:block lg:hidden">
        <DocumentViewer fileUrl={document.fileUrl} formFields={document.aiExtractedFields as Record<string, string>} />
        <Dialog open={reviewDrawerOpen} onOpenChange={setReviewDrawerOpen}>
          <DialogContent className="left-auto right-0 top-12 h-[calc(100vh-48px)] max-w-[440px] translate-x-0 translate-y-0 rounded-none border-b-0 border-l border-r-0 border-t-0 p-0">
            {reviewPanel}
          </DialogContent>
        </Dialog>
      </div>

      <div className="md:hidden">
        <Tabs defaultValue="document" className="space-y-4">
          <TabsList className="grid h-auto w-full grid-cols-2">
            <TabsTrigger value="document">{t('documentReview.documentTab')}</TabsTrigger>
            <TabsTrigger value="review">{t('documentReview.reviewTab')}</TabsTrigger>
          </TabsList>
          <TabsContent value="document">
            <DocumentViewer fileUrl={document.fileUrl} formFields={document.aiExtractedFields as Record<string, string>} />
          </TabsContent>
          <TabsContent value="review">{reviewPanel}</TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
