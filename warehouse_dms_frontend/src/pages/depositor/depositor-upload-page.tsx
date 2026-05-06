import { useMemo, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileText,
  Loader2,
  RefreshCw,
  TriangleAlert,
  Upload,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import { api } from '@/lib/api'
import { confirmUploadAttempt, startUploadAttempt, useDocumentTypesQuery, useWarehousesQuery } from '@/lib/queries'
import { cn } from '@/lib/utils'
import type { DocumentRecord, UploadCompleteEvent, UploadProgressEvent } from '@/types/api'

type StreamEvent =
  | { event: 'connected'; data: Record<string, unknown> }
  | { event: 'progress'; data: UploadProgressEvent }
  | { event: 'complete'; data: UploadCompleteEvent }

type ValidationState = 'idle' | 'running' | 'reconnecting' | 'complete' | 'error'

const STAGE_ORDER = ['ocr', 'validation', 'final'] as const

const DOCUMENT_TYPE_ACCENTS = [
  'bg-brand-teal/10 text-brand-teal border-brand-teal/20',
  'bg-brand-terracotta/10 text-brand-terracotta border-brand-terracotta/20',
  'bg-amber-500/10 text-amber-700 border-amber-300',
  'bg-sky-500/10 text-sky-700 border-sky-300',
  'bg-violet-500/10 text-violet-700 border-violet-300',
  'bg-emerald-500/10 text-emerald-700 border-emerald-300',
]

const STEPS = [
  { key: 'type',     label: 'Document Type' },
  { key: 'details',  label: 'Details'       },
  { key: 'file',     label: 'Attach File'   },
  { key: 'progress', label: 'Processing'    },
  { key: 'complete', label: 'Done'          },
] as const

const DOCUMENT_TYPE_HELP: Record<string, string> = {
  application_form:
    'Form No 1 — Warehouse Operator License Application (Regulation 15(2)). ' +
    'Submit this to apply for a new license, renewal, or amendment. Sections: business details, ' +
    'nature of application (NEW/RENEWAL/AMENDMENT), season, crop types, attached documents ' +
    'checklist, and declaration with stamp and authorized signature.',
  inspection_form:
    'Form No 9 — Warehouse Inspector\'s License Application (Regulation 15(1)(c)). ' +
    'Used by prospective warehouse inspectors to apply for, renew, or amend an inspector\'s license. ' +
    'Requires academic credentials, professional certificates, and CV for key staff.',
  compliance_certificate:
    'Form No 2 — Warehouse Operations Compliance (Regulation 15(2)). ' +
    'Compliance checklist submitted alongside a warehouse license application. ' +
    'Covers weighing equipment, loading facilities, building condition, fire safety, ' +
    'security, and pest control scoring used by TWLB to assess the warehouse.',
  warehouse_receipt: 'Use this for issued warehouse receipts and warehouse-backed proof documents.',
  commodity_misdelivery:
    'Form No 7 — Commodity Mis-Delivery Claim (Section 43(2)(c) of the Warehouse Receipt Act). ' +
    'Filed by a depositor, buyer, or financier when a warehouse operator has released goods ' +
    'in excess of the authorized amount or without observing the terms of the Warehouse Receipt. ' +
    'Identify claimant, respondent, original quantities, over-released amounts, and lot numbers.',
  notice_of_deteriorating_goods:
    'Notice No 2 — Notice of Conditioning / Selling / Disposal of Deteriorating Goods ' +
    '(Regulation 69(1)). Issued by the Collateral Manager or Warehouse Operator to notify ' +
    'the depositor that stored goods are deteriorating in quality or value and may endanger ' +
    'other property or persons. Include warehouse registration number, quantity, and receipt number.',
  depositor_registration:
    'Form No 4 — Depositor Registration & Declaration Form (Fomu ya Mweka Mali). ' +
    'Required to register as a depositor with the Tanzania Warehouse Licensing Board (TWLB). ' +
    'Fill in triplicate: 1st copy for you, 2nd for the Warehouse Operator, 3rd for the Board. ' +
    'Must include: business name, address, crop type, quantity estimate, bank details, and authorized signature.',
  quality_certificate_form:
    'Form No 3 — Quality Certificate. Required for every commodity batch. ' +
    'Records crop name, season, number of bags, weight (kg), moisture content (%), ' +
    'infestation level, admixtures (%), and storage period. ' +
    'Issued under Regulation 58(1)(a) & (2) of the Warehouse Receipt Regulations 2016.',
  warehouse_receipt_delivery_report:
    'Form No 6 — Warehouse Receipt Delivery Report. Submitted to TWLB and the depositor/buyer. ' +
    'Records receipt number, commodity details, quantity, shrinkage/loss, and WRIN number. ' +
    'Must include preparer, verifier, and authorizer signatures. ' +
    'Issued under Regulations 30(d) of the Warehouse Receipt Regulation 2016.',
  commodity_parameter_acknowledgement:
    'Form No 13 — Commodity Quality Parameters Acknowledgement. ' +
    'The buyer signs to confirm they received the commodity in the described quality and grade. ' +
    'After signing, the buyer is liable for any quality discrepancies found thereafter. ' +
    'References the Sales Catalogue Number / Tax Invoice / Release Warrant.',
  notice_of_withholding:
    'Notice No 6 — Notice of Withholding (Lien Notice). Issued when a depositor has not settled ' +
    'outstanding lien or storage charges under Section 54 of the Warehouse Receipt Act. ' +
    'The depositor is given a settlement period before action is taken under Section 55.',
}

const WHAT_HAPPENS_NEXT = [
  'We scan the uploaded file and validate the document details.',
  'If anything needs correction, we tell you exactly what to fix.',
  'If it passes review, it moves automatically to the next approver.',
]

type StepKey = typeof STEPS[number]['key']

/* ─────────────── horizontal step bar ─────────────── */
function StepBar({ current, steps }: { current: StepKey; steps: typeof STEPS }) {
  const currentIdx = steps.findIndex((s) => s.key === current)
  return (
    <div className="flex items-center">
      {steps.map((step, idx) => {
        const done   = idx < currentIdx
        const active = idx === currentIdx
        const isLast = idx === steps.length - 1
        return (
          <div key={step.key} className="flex flex-1 items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-all duration-300',
                  done
                    ? 'border-brand-teal bg-brand-teal text-white'
                    : active
                    ? 'border-brand-teal bg-brand-teal/10 text-brand-teal'
                    : 'border-border bg-canvas text-text-tertiary'
                )}
              >
                {done ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
              </div>
              <span
                className={cn(
                  'hidden text-center text-[10px] font-medium leading-tight sm:block',
                  active ? 'text-brand-teal' : done ? 'text-text-secondary' : 'text-text-tertiary'
                )}
              >
                {step.label}
              </span>
            </div>
            {!isLast && (
              <div
                className={cn(
                  'mx-1 mb-5 h-[2px] flex-1 rounded-full transition-all duration-500',
                  done ? 'bg-brand-teal' : 'bg-border'
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ─────────────── main component ─────────────── */
export function DepositorUploadPage() {
  const { t } = useTranslation()
  const navigate    = useNavigate()
  const queryClient = useQueryClient()
  const fileInputRef  = useRef<HTMLInputElement | null>(null)
  const streamAbortRef = useRef<AbortController | null>(null)
  const { accessToken } = useAuth()
  const { toast } = useToast()

  const documentTypesQuery = useDocumentTypesQuery(true)
  const warehousesQuery    = useWarehousesQuery(true)

  const [selectedTypeId, setSelectedTypeId] = useState('')
  const [warehouseId,    setWarehouseId]    = useState('')
  const [title,          setTitle]          = useState('')
  const [selectedFile,   setSelectedFile]   = useState<File | null>(null)
  const [dragActive,     setDragActive]     = useState(false)

  const [attemptId,         setAttemptId]        = useState<number | null>(null)
  const [streamEvents,      setStreamEvents]      = useState<StreamEvent[]>([])
  const [validationState,   setValidationState]   = useState<ValidationState>('idle')
  const [connectionMessage, setConnectionMessage] = useState('')
  const [streamError,       setStreamError]       = useState<string | null>(null)
  const [completePayload,   setCompletePayload]   = useState<UploadCompleteEvent | null>(null)
  const [createdDocument,   setCreatedDocument]   = useState<DocumentRecord | null>(null)
  const [manualStep,        setManualStep]        = useState<StepKey>('type')

  const availableTypes = useMemo(
    () => (documentTypesQuery.data ?? []).filter((item) => item.allowedUploaderRoles.includes('DEPOSITOR')),
    [documentTypesQuery.data]
  )
  const selectedType      = availableTypes.find((item) => item.id === selectedTypeId)
  const selectedWarehouse = (warehousesQuery.data ?? []).find((item) => String(item.id) === warehouseId)

  const currentStep: StepKey = createdDocument
    ? 'complete'
    : validationState === 'running' || validationState === 'reconnecting' || completePayload
    ? 'progress'
    : manualStep

  const stageState = useMemo(() => {
    const states: Record<string, 'idle' | 'active' | 'done'> = { ocr: 'idle', validation: 'idle', final: 'idle' }
    for (const event of streamEvents) {
      if (event.event === 'progress') {
        const s  = event.data.stage  as string | undefined
        const st = event.data.status as string | undefined
        // Server emits status="done" when a stage finishes and status="processing"
        // while it is running. "complete" is only used inside the `complete` event.
        const isDone = st === 'done' || st === 'complete'
        if (s === 'ocr')             { states.ocr        = isDone ? 'done' : 'active' }
        else if (s === 'validation') { states.validation = isDone ? 'done' : 'active' }
        else if (s === 'final')      { states.final      = isDone ? 'done' : 'active' }
      }
      if (event.event === 'complete') { states.final = 'done' }
    }
    // When the whole pipeline is complete, force all stages to done
    if (validationState === 'complete') {
      states.ocr = 'done'
      states.validation = 'done'
      states.final = 'done'
    }
    // If we're running but haven't heard from OCR yet, show it as active
    if (validationState === 'running' && states.ocr === 'idle') { states.ocr = 'active' }
    return states
  }, [streamEvents, validationState])

  // Extract the detail payload from the last 'done' progress event for each stage.
  // These come from the backend: OCR sends character_count + confidence;
  // validation sends warning_count.
  const stageDetails = useMemo(() => {
    const details: Record<string, Record<string, unknown>> = {}
    for (const event of streamEvents) {
      if (event.event === 'progress') {
        const stage = event.data.stage as string | undefined
        const st    = event.data.status as string | undefined
        if (stage && (st === 'done' || st === 'complete') && event.data.details) {
          details[stage] = event.data.details
        }
      }
    }
    return details
  }, [streamEvents])

  const warnings = completePayload?.warnings ?? []

  const confirmMutation = useMutation({
    mutationFn: ({ override }: { override: boolean }) => {
      if (!attemptId) throw new Error(t('depositorUpload.validationMissing'))
      return confirmUploadAttempt(attemptId, override)
    },
    onSuccess: async (document) => {
      setCreatedDocument(document)
      await queryClient.invalidateQueries({ queryKey: ['documents'] })
      toast({ title: t('depositorUpload.successTitle') })
    },
    onError: (error) => {
      toast({ title: t('depositorUpload.confirmErrorTitle'), description: error instanceof Error ? error.message : t('depositorUpload.confirmErrorBody'), variant: 'destructive' })
    },
  })

  const startMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile || !selectedTypeId || !warehouseId || !title.trim()) {
        throw new Error(t('depositorUpload.validationMissing'))
      }
      return startUploadAttempt({ file: selectedFile, documentTypeId: selectedTypeId, warehouseId, title: title.trim() })
    },
    onSuccess: async ({ attemptId: nextAttemptId, streamUrl }) => {
      setAttemptId(nextAttemptId)
      setCompletePayload(null)
      setCreatedDocument(null)
      setStreamError(null)
      setValidationState('running')
      setConnectionMessage(t('depositorUpload.connecting'))
      setStreamEvents([])
      try {
        await subscribeToStream(streamUrl, nextAttemptId)
      } catch (error) {
        const message = error instanceof Error ? error.message : t('depositorUpload.streamErrorBody')
        setValidationState('error')
        setStreamError(message)
        toast({ title: t('depositorUpload.streamErrorTitle'), description: message, variant: 'destructive' })
      }
    },
    onError: (error) => {
      toast({ title: t('depositorUpload.startErrorTitle'), description: error instanceof Error ? error.message : t('depositorUpload.startErrorBody'), variant: 'destructive' })
    },
  })

  const busyNow = startMutation.isPending || confirmMutation.isPending

  function resetFlow() {
    streamAbortRef.current?.abort()
    setAttemptId(null)
    setStreamEvents([])
    setValidationState('idle')
    setConnectionMessage('')
    setStreamError(null)
    setCompletePayload(null)
    setCreatedDocument(null)
  }

  function resetAll() {
    resetFlow()
    setSelectedTypeId('')
    setWarehouseId('')
    setTitle('')
    setSelectedFile(null)
    setManualStep('type')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleFileChange(file: File | null) {
    setSelectedFile(file)
    resetFlow()
  }

  function goNext() {
    const order: StepKey[] = ['type', 'details', 'file', 'progress', 'complete']
    const idx = order.indexOf(manualStep)
    if (idx < order.length - 1) setManualStep(order[idx + 1] as StepKey)
  }

  function goBack() {
    const order: StepKey[] = ['type', 'details', 'file', 'progress', 'complete']
    const idx = order.indexOf(manualStep)
    if (idx > 0) setManualStep(order[idx - 1] as StepKey)
  }

  async function subscribeToStream(streamPath: string, _nextAttemptId: number) {
    if (!accessToken) throw new Error(t('depositorUpload.authRequired'))
    streamAbortRef.current?.abort()
    const controller = new AbortController()
    streamAbortRef.current = controller
    const apiUrl    = String(api.defaults.baseURL || window.location.origin)
    const baseOrigin = new URL(apiUrl, window.location.origin).origin
    const streamUrl  = new URL(streamPath, baseOrigin).toString()
    let attempt = 0
    const retrySchedule = [1000, 2000, 4000, 8000, 12000]
    let sawTerminalEvent = false

    while (!controller.signal.aborted && attempt <= retrySchedule.length) {
      try {
        await consumeSseStream({
          url: streamUrl,
          token: accessToken,
          signal: controller.signal,
          onEvent: async (event) => {
            setStreamEvents((current) => [...current, event])
            if (event.event === 'connected') {
              setConnectionMessage((event.data?.message as string | undefined) || t('depositorUpload.connected'))
            }
            if (event.event === 'complete') {
              sawTerminalEvent = true
              setCompletePayload(event.data)
              setValidationState('complete')
              setConnectionMessage('')
              if (event.data.outcome === 'PASSED') {
                await confirmMutation.mutateAsync({ override: false })
              }
              controller.abort()
            }
          },
        })
        if (sawTerminalEvent) break
      } catch (error) {
        if (controller.signal.aborted) break
        if (attempt >= retrySchedule.length) throw error
        setValidationState('reconnecting')
        const delay = retrySchedule[attempt] ?? 12000
        await sleep(delay)
        setValidationState('running')
        attempt++
      }
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <Link to="/depositor" className="inline-flex items-center gap-1 text-sm font-medium text-brand-teal hover:underline">
          <ArrowLeft className="h-4 w-4" />
          {t('depositorUpload.back')}
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-text-primary">{t('depositorUpload.title')}</h1>
        <p className="mt-1 text-sm text-text-secondary">{t('depositorUpload.subtitle')}</p>
      </div>

      <div className="rounded-2xl border border-border bg-surface px-4 py-4 shadow-sm">
        <div className="text-sm font-semibold text-text-primary">What happens next</div>
        <div className="mt-3 space-y-2">
          {WHAT_HAPPENS_NEXT.map((item, index) => (
            <div key={item} className="flex items-start gap-3">
              <div className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-info-bg text-[10px] font-bold text-brand-teal">
                {index + 1}
              </div>
              <p className="text-xs leading-5 text-text-secondary">{item}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Horizontal step bar */}
      <div className="rounded-2xl border border-border bg-surface px-5 pb-4 pt-5 shadow-sm">
        <StepBar current={currentStep} steps={STEPS} />
      </div>

      {/* Step content */}
      <div className="rounded-2xl border border-border bg-surface shadow-sm">

        {/* Step 1 – Choose document type */}
        {currentStep === 'type' && (
          <div className="space-y-5 px-5 py-6">
            <div>
              <h2 className="text-base font-semibold text-text-primary">Choose a Document Type</h2>
              <p className="mt-1 text-sm text-text-secondary">{t('depositorUpload.typeHelp')}</p>
            </div>
            <div className="grid gap-3">
              {documentTypesQuery.isLoading
                ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)
                : availableTypes.length === 0
                ? <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-text-secondary">No document types are available for upload.</div>
                : availableTypes.map((type, index) => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => setSelectedTypeId(type.id)}
                    className={cn(
                      'group rounded-2xl border px-4 py-4 text-left transition-all duration-200 hover:shadow-sm',
                      selectedTypeId === type.id ? 'border-brand-teal bg-brand-teal/5 shadow-sm' : 'border-border hover:border-brand-teal/50'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn('shrink-0 rounded-xl border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider', DOCUMENT_TYPE_ACCENTS[index % DOCUMENT_TYPE_ACCENTS.length])}>
                        {type.category}
                      </div>
                      {type.formNumber && (
                        <div className="shrink-0 rounded-lg border border-border bg-canvas px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
                          {type.formNumber}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-text-primary">{type.label}</span>
                          {selectedTypeId === type.id && <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-teal" />}
                        </div>
                        <p className="mt-0.5 text-xs text-text-secondary">
                          {type.requiredFields.slice(0, 3).join(' · ') || t('depositorUpload.genericDoc')}
                        </p>
                        <p className="mt-2 text-xs leading-5 text-text-tertiary">
                          {DOCUMENT_TYPE_HELP[type.id] ?? 'Choose this when it best matches the document you are submitting.'}
                        </p>
                      </div>
                    </div>
                  </button>
                ))
              }
            </div>
            <div className="flex justify-end pt-2">
              <Button type="button" disabled={!selectedTypeId} onClick={goNext} className="gap-2">
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2 – Details */}
        {currentStep === 'details' && (
          <div className="space-y-5 px-5 py-6">
            <div>
              <h2 className="text-base font-semibold text-text-primary">Document Details</h2>
              <p className="mt-1 text-sm text-text-secondary">{t('depositorUpload.detailsHelp')}</p>
            </div>
            <div className="space-y-2">
              <Label>Document Type</Label>
              <div className="flex items-center gap-2 rounded-xl border border-border bg-canvas px-4 py-2.5 text-sm text-text-primary">
                <FileText className="h-4 w-4 text-brand-teal" />
                {selectedType?.label}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="upload-title">{t('depositorUpload.titleLabel')}</Label>
              <Input id="upload-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('depositorUpload.titlePlaceholder')} />
            </div>
            <div className="space-y-2">
              <Label>{t('depositorUpload.warehouseLabel')}</Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('depositorUpload.warehousePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {(warehousesQuery.data ?? []).map((w) => (
                    <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={goBack} className="gap-2">
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button type="button" onClick={goNext} disabled={!title.trim() || !warehouseId} className="flex-1 gap-2">
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3 – Attach file */}
        {currentStep === 'file' && (
          <div className="space-y-5 px-5 py-6">
            <div>
              <h2 className="text-base font-semibold text-text-primary">Attach File</h2>
              <p className="mt-1 text-sm text-text-secondary">{t('depositorUpload.fileHelp')}</p>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault()
                setDragActive(true)
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(event) => {
                event.preventDefault()
                setDragActive(false)
                handleFileChange(event.dataTransfer.files?.[0] ?? null)
              }}
              className={cn(
                'flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-all duration-200',
                dragActive || selectedFile ? 'border-brand-teal bg-brand-teal/5' : 'border-border hover:border-brand-teal/50 hover:bg-canvas'
              )}
            >
              <div className={cn('flex h-14 w-14 items-center justify-center rounded-2xl', selectedFile ? 'bg-brand-teal text-white' : 'bg-canvas text-text-tertiary')}>
                {selectedFile ? <CheckCircle2 className="h-7 w-7" /> : <Upload className="h-7 w-7" />}
              </div>
              <div>
                <p className="text-sm font-semibold text-text-primary">
                  {selectedFile ? selectedFile.name : 'Drop your file here or tap to browse'}
                </p>
                <p className="mt-0.5 text-xs text-text-secondary">
                  {selectedFile ? `${Math.max(1, Math.round(selectedFile.size / 1024))} KB · Click to change` : `${t('depositorUpload.fileFormats')} · PDF, PNG, JPG, TIFF`}
                </p>
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff"
              className="hidden"
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
            />
            {selectedFile && (
              <div className="space-y-1 rounded-xl border border-border-subtle bg-canvas px-4 py-3 text-xs text-text-secondary">
                <div className="flex justify-between"><span className="text-text-tertiary">Type</span><span className="font-medium text-text-primary">{selectedType?.label}</span></div>
                <div className="flex justify-between"><span className="text-text-tertiary">Title</span><span className="font-medium text-text-primary">{title}</span></div>
                <div className="flex justify-between"><span className="text-text-tertiary">Warehouse</span><span className="font-medium text-text-primary">{selectedWarehouse?.name}</span></div>
              </div>
            )}
            <div className="rounded-xl border border-border bg-canvas px-4 py-3 text-xs text-text-secondary">
              <div className="mb-2 font-semibold text-text-primary">After upload</div>
              <ul className="space-y-1.5">
                {WHAT_HAPPENS_NEXT.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={goBack} className="gap-2">
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button type="button" onClick={() => startMutation.mutate()} disabled={!selectedFile || busyNow} className="flex-1 gap-2">
                {startMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {t('depositorUpload.start')}
              </Button>
            </div>
          </div>
        )}

        {/* Step 4 – Processing */}
        {currentStep === 'progress' && (
          <div className="space-y-5 px-5 py-6">
            <div>
              <h2 className="text-base font-semibold text-text-primary">{t('depositorUpload.steps.progress')}</h2>
              <p className="mt-1 text-sm text-text-secondary">{connectionMessage || t('depositorUpload.waiting')}</p>
            </div>
            <div className="space-y-3">
              {STAGE_ORDER.map((stageKey) => {
                const state   = stageState[stageKey]
                const details = stageDetails[stageKey] ?? {}
                const ocrChars      = stageKey === 'ocr'        ? (details.character_count as number | undefined) : undefined
                const ocrConfidence = stageKey === 'ocr'        ? (details.confidence      as number | undefined) : undefined
                const warnCount     = stageKey === 'validation'  ? (details.warning_count   as number | undefined) : undefined
                const providerLabel = stageKey === 'ocr' ? 'LenziAi' : stageKey === 'validation' ? 'GhalaAI' : 'Review Queue'
                return (
                  <div key={stageKey} className={cn(
                    'rounded-2xl border px-4 py-4 transition-all duration-300',
                    state === 'done' ? 'border-brand-teal/30 bg-brand-teal/5' : state === 'active' ? 'border-brand-teal/20 bg-brand-teal/5 animate-pulse-border' : 'border-border bg-canvas'
                  )}>
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                        state === 'done' ? 'bg-brand-teal text-white' : state === 'active' ? 'bg-brand-teal/10 text-brand-teal' : 'bg-border text-text-tertiary'
                      )}>
                        {state === 'active' ? <Loader2 className="h-5 w-5 animate-spin" /> : state === 'done' ? <CheckCircle2 className="h-5 w-5" /> : <div className="h-2.5 w-2.5 rounded-full bg-current" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-text-primary">{t(`depositorUpload.stageLabels.${stageKey}`)}</p>
                          <span className="shrink-0 rounded-md border border-border bg-canvas px-2 py-0.5 font-mono text-[10px] font-semibold text-text-tertiary">
                            {providerLabel}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-text-secondary">{t(`depositorUpload.stageHints.${stageKey}`)}</p>
                      </div>
                    </div>
                    {/* Live detail chips shown once a stage is done */}
                    {state === 'done' && (ocrChars !== undefined || ocrConfidence !== undefined || warnCount !== undefined) && (
                      <div className="mt-3 flex flex-wrap gap-2 pl-14">
                        {ocrChars !== undefined && (
                          <span className="rounded-full bg-brand-teal/10 px-2.5 py-0.5 text-[11px] font-semibold text-brand-teal">
                            {ocrChars.toLocaleString()} characters extracted
                          </span>
                        )}
                        {ocrConfidence !== undefined && (
                          <span className={cn(
                            'rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                            ocrConfidence >= 0.90 ? 'bg-emerald-100 text-emerald-700'
                            : ocrConfidence >= 0.75 ? 'bg-amber-100 text-amber-700'
                            : 'bg-red-100 text-red-700'
                          )}>
                            {Math.round(ocrConfidence * 100)}% read confidence
                          </span>
                        )}
                        {warnCount !== undefined && (
                          <span className={cn(
                            'rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                            warnCount === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                          )}>
                            {warnCount === 0 ? 'All fields verified' : `${warnCount} issue${warnCount === 1 ? '' : 's'} found`}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {completePayload && (
              <div className={cn(
                'space-y-4 rounded-2xl border px-4 py-4',
                completePayload.outcome === 'PASSED' ? 'border-brand-teal/20 bg-brand-teal/5'
                  : completePayload.outcome === 'SOFT_WARNING' ? 'border-amber-300 bg-amber-50'
                  : 'border-semantic-error/30 bg-semantic-error/5'
              )}>
                <div className="flex items-start gap-3">
                  {completePayload.outcome === 'PASSED'
                    ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-teal" />
                    : <TriangleAlert className={cn('mt-0.5 h-5 w-5 shrink-0', completePayload.outcome === 'SOFT_WARNING' ? 'text-amber-700' : 'text-semantic-error')} />
                  }
                  <div>
                    <p className="text-sm font-semibold text-text-primary">
                      {completePayload.outcome === 'PASSED' ? t('depositorUpload.passTitle')
                        : completePayload.outcome === 'SOFT_WARNING' ? t('depositorUpload.softWarningTitle')
                        : t('depositorUpload.hardRejectTitle')}
                    </p>
                    <p className="mt-1 text-sm text-text-secondary">
                      {completePayload.outcome === 'PASSED' ? t('depositorUpload.passBody')
                        : completePayload.outcome === 'SOFT_WARNING' ? t('depositorUpload.softWarningBody')
                        : t('depositorUpload.hardRejectBody')}
                    </p>
                  </div>
                </div>
                {warnings.length > 0 && (
                  <ul className="space-y-1.5 text-sm text-text-primary">
                    {warnings.map((w, i) => <li key={i} className="rounded-xl bg-surface/80 px-3 py-2">{w}</li>)}
                  </ul>
                )}
                {completePayload.outcome === 'SOFT_WARNING' && (
                  <div className="flex gap-3">
                    <Button type="button" variant="secondary" className="flex-1" onClick={resetFlow} disabled={confirmMutation.isPending}>
                      <RefreshCw className="h-4 w-4" /> {t('depositorUpload.fixAndRetry')}
                    </Button>
                    <Button type="button" className="flex-1" onClick={() => confirmMutation.mutate({ override: true })} disabled={confirmMutation.isPending}>
                      {confirmMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {t('depositorUpload.submitAnyway')}
                    </Button>
                  </div>
                )}
                {completePayload.outcome === 'HARD_REJECT' && (
                  <Button type="button" variant="secondary" className="w-full" onClick={resetAll}>
                    <RefreshCw className="h-4 w-4" /> {t('depositorUpload.tryAgain')}
                  </Button>
                )}
              </div>
            )}
            {validationState === 'error' && streamError && (
              <div className="rounded-2xl border border-semantic-error/30 bg-semantic-error/5 px-4 py-4 text-sm">
                <p className="font-semibold text-semantic-error">{t('depositorUpload.streamErrorTitle')}</p>
                <p className="mt-1 text-text-secondary">{streamError}</p>
                <Button type="button" variant="secondary" className="mt-3 w-full" onClick={resetAll}>
                  {t('depositorUpload.tryAgain')}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Step 5 – Complete */}
        {currentStep === 'complete' && createdDocument && (
          <div className="space-y-5 px-5 py-8 text-center">
            <div className="flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-teal/10 text-brand-teal">
                <CheckCircle2 className="h-8 w-8" />
              </div>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">{t('depositorUpload.successTitle')}</h2>
              <p className="mt-1 text-sm text-text-secondary">{t('depositorUpload.successBody', { title: createdDocument.title })}</p>
              {selectedWarehouse && <p className="mt-0.5 text-xs text-text-tertiary">{selectedWarehouse.name}</p>}
            </div>
            <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-center">
              <Button type="button" onClick={() => navigate(`/depositor/documents/${createdDocument.id}`)}>
                {t('depositorUpload.viewDocument')}
              </Button>
              <Button type="button" variant="secondary" onClick={resetAll}>
                {t('depositorUpload.uploadAnother')}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Reset footnote */}
      {currentStep !== 'progress' && currentStep !== 'complete' && (
        <div className="text-center">
          <button type="button" onClick={resetAll} className="text-xs text-text-tertiary hover:text-text-secondary hover:underline">
            {t('depositorUpload.reset')}
          </button>
        </div>
      )}
    </div>
  )
}

/* ─────────────── SSE utilities ─────────────── */

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

async function consumeSseStream({
  url, token, signal, onEvent,
}: {
  url: string
  token: string
  signal: AbortSignal
  onEvent: (event: StreamEvent) => Promise<void> | void
}) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
    signal,
  })
  if (!response.ok) throw new Error(`SSE request failed with status ${response.status}`)
  if (!response.body)  throw new Error('SSE stream is not available')

  const reader  = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (!signal.aborted) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''
    for (const part of parts) {
      const event = parseSseChunk(part)
      if (event) await onEvent(event)
    }
  }
  if (buffer.trim()) {
    const event = parseSseChunk(buffer)
    if (event) await onEvent(event)
  }
}

function parseSseChunk(chunk: string): StreamEvent | null {
  const lines    = chunk.split('\n').map((l) => l.trim()).filter(Boolean)
  if (!lines.length) return null
  const eventLine = lines.find((l) => l.startsWith('event:'))
  const dataLines = lines.filter((l) => l.startsWith('data:'))
  const eventName = eventLine?.slice(6).trim()
  if (!eventName) return null
  const rawData = dataLines.map((l) => l.slice(5).trim()).join('\n') || '{}'
  const parsed: unknown = (() => { try { return JSON.parse(rawData) } catch { return {} } })()
  if (eventName === 'connected') return { event: 'connected', data: (parsed as Record<string, unknown>) ?? {} }
  if (eventName === 'progress')  return { event: 'progress',  data: (parsed as UploadProgressEvent)   ?? {} }
  if (eventName === 'complete')  return { event: 'complete',  data: (parsed as UploadCompleteEvent)   ?? {} }
  return null
}
