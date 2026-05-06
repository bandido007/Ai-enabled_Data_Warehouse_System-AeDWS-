/**
 * DepositorCorrectionPage
 *
 * Renders the depositor registration form pre-filled with the existing
 * document's extracted fields. The depositor corrects whatever the reviewer
 * flagged, then submits via the FSM "resubmit" transition so the document
 * goes back to PENDING_STAFF with updated field values and a fresh AI review.
 */

import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Loader2,
  Lock,
  Phone,
  RotateCcw,
  User,
  Wheat,
} from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { submitResubmit, useDocumentQuery } from '@/lib/queries'

// ── Crop types (same as registration form) ───────────────────────────────────
const CROP_TYPES = [
  'Maize / Mahindi', 'Rice / Mchele', 'Paddy / Mpunga', 'Wheat / Ngano',
  'Bean / Maharagwe', 'Sesame / Ufuta', 'Sunflower / Alizeti', 'Soybean / Soya',
  'Sorghum / Mtama', 'Millet / Uwele', 'Groundnut / Karanga', 'Cashew Nut / Korosho',
  'Coffee / Kahawa', 'Cotton / Pamba', 'Other / Nyingine',
]

// ── Validation ────────────────────────────────────────────────────────────────
const TZ_PHONE = /^(\+255|0)[67]\d{8}$/

type FieldName =
  | 'businessName' | 'physicalAddress' | 'telephoneNumber' | 'authorizedSignatoryName'
  | 'cropType' | 'storageQuantityKg' | 'bankName' | 'bankBranch' | 'bankAccount'
  | 'depositorFullName' | 'depositorDate'

function validateField(name: FieldName, value: string): string | null {
  switch (name) {
    case 'businessName':
      if (!value.trim()) return 'Business name is required'
      if (value.trim().length < 3) return 'Must be at least 3 characters'
      return null
    case 'physicalAddress':
      if (!value.trim()) return 'Address is required'
      if (value.trim().length < 5) return 'Must be at least 5 characters'
      return null
    case 'telephoneNumber':
      if (!value.trim()) return 'Phone number is required'
      if (!TZ_PHONE.test(value.trim())) return 'Enter a valid Tanzania number (+255… or 0…)'
      return null
    case 'authorizedSignatoryName':
      if (!value.trim()) return 'Authorized signatory name is required'
      if (value.trim().length < 3) return 'Must be at least 3 characters'
      return null
    case 'cropType':
      if (!value) return 'Crop type is required'
      return null
    case 'storageQuantityKg': {
      if (!value.trim()) return 'Storage quantity is required'
      const n = Number(value)
      if (isNaN(n) || n <= 0) return 'Must be a positive number'
      if (n > 10_000_000) return 'Value seems too large'
      return null
    }
    case 'bankName':
      if (!value.trim()) return 'Bank name is required'
      return null
    case 'bankBranch':
      if (!value.trim()) return 'Branch name is required'
      return null
    case 'bankAccount':
      if (!value.trim()) return 'Account number is required'
      if (value.trim().length < 5) return 'Too short'
      return null
    case 'depositorFullName':
      if (!value.trim()) return 'Full name is required'
      if (value.trim().split(' ').length < 2) return 'Provide first and last name'
      return null
    case 'depositorDate': {
      if (!value) return 'Date is required'
      const d = new Date(value)
      if (d > new Date()) return 'Date cannot be in the future'
      return null
    }
    default:
      return null
  }
}

// ── Small UI helpers ──────────────────────────────────────────────────────────
function FormField({
  label, required, children, hint, error,
}: {
  label: React.ReactNode; required?: boolean
  children: React.ReactNode; hint?: string; error?: string | null
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-semibold text-gray-800 leading-snug">
        {label}{required && <span className="ml-0.5 text-red-500">*</span>}
      </Label>
      {children}
      {error ? (
        <p className="flex items-center gap-1 text-xs font-medium text-red-600">
          <AlertCircle className="h-3 w-3 shrink-0" />{error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

function SectionHeader({ number, en, sw, icon, locked }: {
  number?: number; en: string; sw: string
  icon?: React.ReactNode; locked?: boolean
}) {
  return (
    <div className="flex items-start gap-3 border-b border-amber-200 pb-3">
      {icon && <div className="mt-0.5 shrink-0 text-amber-600">{icon}</div>}
      <div className="flex-1">
        <div className="flex items-center gap-2">
          {number !== undefined && (
            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-800">
              {number}
            </span>
          )}
          <p className="text-sm font-bold leading-tight text-gray-900">{en}</p>
        </div>
        <p className="ml-8 mt-0.5 text-xs italic text-amber-700">{sw}</p>
      </div>
      {locked && (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
          <Lock className="h-2.5 w-2.5" />Operator fills
        </span>
      )}
    </div>
  )
}

function LockedInput({ placeholder }: { placeholder: string }) {
  return (
    <div className="flex h-10 cursor-not-allowed select-none items-center rounded-md border border-dashed border-gray-300 bg-gray-50 px-3 text-xs italic text-gray-400">
      <Lock className="mr-2 h-3 w-3 shrink-0 text-gray-300" />{placeholder}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function DepositorCorrectionPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const submitAttempted = useRef(false)

  const docQuery = useDocumentQuery(id, Boolean(id), false)
  const doc = docQuery.data

  // ── Field state (populated once doc loads) ────────────────────────────────
  const [hydrated,               setHydrated]              = useState(false)
  const [businessName,           setBusinessName]          = useState('')
  const [physicalAddress,        setPhysicalAddress]       = useState('')
  const [telephoneNumber,        setTelephoneNumber]       = useState('')
  const [authorizedSignatoryName,setAuthorizedSignatoryName]= useState('')
  const [cropType,               setCropType]              = useState('')
  const [storageQuantityKg,      setStorageQuantityKg]     = useState('')
  const [bankName,               setBankName]              = useState('')
  const [bankBranch,             setBankBranch]            = useState('')
  const [bankAccount,            setBankAccount]           = useState('')
  const [depositorFullName,      setDepositorFullName]     = useState('')
  const [depositorDate,          setDepositorDate]         = useState('')
  const [declarationAgreed,      setDeclarationAgreed]     = useState(false)
  const [touched, setTouched]     = useState<Partial<Record<FieldName, boolean>>>({})

  // Hydrate fields from doc.aiExtractedFields the first time the doc loads
  useEffect(() => {
    if (!doc || hydrated) return
    const f = (doc.aiExtractedFields ?? {}) as Record<string, string>
    setBusinessName(f.business_name ?? '')
    setPhysicalAddress(f.physical_address ?? '')
    setTelephoneNumber(f.telephone_number ?? '')
    setAuthorizedSignatoryName(f.authorized_signatory_name ?? '')
    setCropType(f.crop_type ?? '')
    setStorageQuantityKg(f.storage_quantity_kg ?? '')
    setBankName(f.bank_name ?? '')
    setBankBranch(f.bank_branch ?? '')
    setBankAccount(f.bank_account_number ?? '')
    setDepositorFullName(f.depositor_signature ?? '')
    setDepositorDate(f.date ?? '')
    setHydrated(true)
  }, [doc, hydrated])

  // ── Validation helpers ────────────────────────────────────────────────────
  const currentValues: Record<FieldName, string> = {
    businessName, physicalAddress, telephoneNumber, authorizedSignatoryName,
    cropType, storageQuantityKg, bankName, bankBranch, bankAccount,
    depositorFullName, depositorDate,
  }

  const getError = (name: FieldName): string | null => {
    if (!touched[name] && !submitAttempted.current) return null
    return validateField(name, currentValues[name])
  }

  const errors = Object.fromEntries(
    (Object.keys(currentValues) as FieldName[]).map(k => [k, getError(k)])
  ) as Partial<Record<FieldName, string | null>>

  const touch = (name: FieldName) => setTouched(prev => ({ ...prev, [name]: true }))

  const inputCls = (name: FieldName) =>
    `border-gray-300 focus:border-amber-400 focus:ring-amber-300 transition-colors ${
      errors[name] ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : ''
    }`

  // ── Submission ────────────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: () => {
      const allFields = Object.keys(currentValues) as FieldName[]
      setTouched(Object.fromEntries(allFields.map(f => [f, true])))
      submitAttempted.current = true

      const firstErr = allFields.find(f => validateField(f, currentValues[f]))
      if (firstErr || !declarationAgreed) {
        throw new Error('Please fix the validation errors before resubmitting.')
      }

      return submitResubmit(Number(id), {
        business_name: businessName,
        physical_address: physicalAddress,
        telephone_number: telephoneNumber,
        authorized_signatory_name: authorizedSignatoryName,
        crop_type: cropType,
        storage_quantity_kg: storageQuantityKg,
        bank_name: bankName,
        bank_branch: bankBranch,
        bank_account_number: bankAccount,
        depositor_signature: depositorFullName,
        date: depositorDate,
      })
    },
    onSuccess: () => {
      toast({
        title: 'Corrections submitted',
        description: 'Your document is back with staff for review.',
      })
      navigate(`/depositor/documents/${id}`)
    },
    onError: (err: Error) => {
      toast({ variant: 'destructive', title: 'Resubmission failed', description: err.message })
    },
  })

  // ── Loading / not found ───────────────────────────────────────────────────
  if (docQuery.isLoading || !hydrated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-orange-50 p-4">
        <div className="mx-auto max-w-3xl space-y-4">
          <Skeleton className="h-12 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    )
  }

  if (!doc) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8 text-center">
        <div>
          <p className="text-lg font-semibold text-gray-800">Document not found</p>
          <Link to="/depositor/documents" className="mt-4 block text-sm text-amber-600 underline">
            Back to documents
          </Link>
        </div>
      </div>
    )
  }

  // Guard: the document must be in CORRECTION_NEEDED state
  if (doc.status !== 'CORRECTION_NEEDED') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-500" />
        <p className="text-base font-semibold text-gray-800">
          This document is not awaiting corrections.
        </p>
        <p className="text-sm text-gray-500">Current status: <strong>{doc.status}</strong></p>
        <Link to={`/depositor/documents/${id}`}>
          <Button variant="secondary">View document</Button>
        </Link>
      </div>
    )
  }

  const correctionNote = doc.currentCorrectionNote || 'A reviewer has requested changes. Please update the fields below.'

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-orange-50">
      {/* Top bar */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-amber-100 bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
        <Link to={`/depositor/documents/${id}`}>
          <Button variant="ghost" size="sm" className="gap-1.5 text-amber-700 hover:bg-amber-50">
            <ArrowLeft className="h-4 w-4" />Back
          </Button>
        </Link>
        <div className="h-5 w-px bg-amber-200" />
        <ClipboardList className="h-4 w-4 text-amber-600" />
        <span className="text-sm font-semibold text-gray-800">Correct & Resubmit — Document #{id}</span>
      </div>

      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">

        {/* ── Correction note banner ── */}
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
            <span className="text-sm font-bold text-red-700">Correction required — Marekebisho yanahitajika</span>
          </div>
          <p className="text-sm leading-relaxed text-red-700">{correctionNote}</p>
          <p className="mt-2 text-xs text-red-500">
            Review the note above, update the highlighted fields below, and resubmit.
          </p>
        </div>

        {/* ── Official form header ── */}
        <div className="overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm">
          <div className="h-2 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500" />
          <div className="px-6 py-5">
            <div className="flex items-start justify-between">
              <div className="space-y-0.5">
                <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                  Made under Section 3 of the Warehouse Receipt Act No 10 of 2005
                </p>
                <p className="text-[10px] italic text-amber-600">
                  Chini ya Kifungu cha 3 Sheria Namba 10 ya 2005
                </p>
              </div>
              <div className="ml-4 shrink-0 text-right">
                <p className="text-[10px] text-muted-foreground">FOMU / FORM</p>
                <p className="text-2xl font-black text-amber-600">NO 4</p>
              </div>
            </div>
            <div className="mt-4 border-y border-amber-100 py-4 text-center">
              <h1 className="text-xl font-black uppercase tracking-tight text-gray-900">
                Depositors Registration Form
              </h1>
              <p className="mt-1 text-sm font-semibold italic text-amber-700">Form ya Mweka Mali</p>
              <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                <RotateCcw className="h-3 w-3" />
                Correction mode — update and resubmit
              </div>
            </div>
          </div>
        </div>

        {/* ── Section 1: Business info ── */}
        <div className="space-y-5 rounded-2xl border border-amber-100 bg-white px-6 py-6 shadow-sm">
          <SectionHeader number={1} en="Business Information" sw="Taarifa za Biashara" icon={<Building2 className="h-4 w-4" />} />
          <FormField label={<>Business / Organization Name <span className="text-muted-foreground text-xs">(Jina la Biashara)</span></>} required error={errors.businessName}>
            <Input value={businessName} onChange={e => setBusinessName(e.target.value)} onBlur={() => touch('businessName')} className={inputCls('businessName')} placeholder="e.g. Kilimo Enterprises Ltd" />
          </FormField>
          <FormField label={<>Physical Address <span className="text-muted-foreground text-xs">(Anwani ya Makazi)</span></>} required error={errors.physicalAddress}>
            <Textarea value={physicalAddress} onChange={e => setPhysicalAddress(e.target.value)} onBlur={() => touch('physicalAddress')} className={`min-h-[80px] ${inputCls('physicalAddress')}`} placeholder="Street, Ward, District, Region" />
          </FormField>
          <FormField label={<>Telephone Number <span className="text-muted-foreground text-xs">(Nambari ya Simu)</span></>} required error={errors.telephoneNumber} hint="Format: +255XXXXXXXXX or 07XXXXXXXX">
            <Input value={telephoneNumber} onChange={e => setTelephoneNumber(e.target.value)} onBlur={() => touch('telephoneNumber')} className={inputCls('telephoneNumber')} placeholder="+255712345678" type="tel" />
          </FormField>
        </div>

        {/* ── Section 2: Authorized signatory ── */}
        <div className="space-y-5 rounded-2xl border border-amber-100 bg-white px-6 py-6 shadow-sm">
          <SectionHeader number={2} en="Authorized Signatory" sw="Mwakilishi Aliyeidhinishwa" icon={<User className="h-4 w-4" />} />
          <FormField label={<>Full Name of Authorized Signatory <span className="text-muted-foreground text-xs">(Jina Kamili)</span></>} required error={errors.authorizedSignatoryName}>
            <Input value={authorizedSignatoryName} onChange={e => setAuthorizedSignatoryName(e.target.value)} onBlur={() => touch('authorizedSignatoryName')} className={inputCls('authorizedSignatoryName')} placeholder="As it appears on official documents" />
          </FormField>
        </div>

        {/* ── Section 3: Commodity ── */}
        <div className="space-y-5 rounded-2xl border border-amber-100 bg-white px-6 py-6 shadow-sm">
          <SectionHeader number={3} en="Commodity Details" sw="Maelezo ya Bidhaa" icon={<Wheat className="h-4 w-4" />} />
          <FormField label={<>Crop / Commodity Type <span className="text-muted-foreground text-xs">(Aina ya Mazao)</span></>} required error={errors.cropType}>
            <Select value={cropType} onValueChange={v => { setCropType(v); touch('cropType') }}>
              <SelectTrigger className={inputCls('cropType')}>
                <SelectValue placeholder="Select crop type..." />
              </SelectTrigger>
              <SelectContent>
                {CROP_TYPES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label={<>Storage Quantity (kg) <span className="text-muted-foreground text-xs">(Kiasi cha Kuhifadhi)</span></>} required error={errors.storageQuantityKg}>
            <Input value={storageQuantityKg} onChange={e => setStorageQuantityKg(e.target.value)} onBlur={() => touch('storageQuantityKg')} className={inputCls('storageQuantityKg')} placeholder="e.g. 5000" type="number" min="1" />
          </FormField>
        </div>

        {/* ── Section 4: Banking ── */}
        <div className="space-y-5 rounded-2xl border border-amber-100 bg-white px-6 py-6 shadow-sm">
          <SectionHeader number={4} en="Banking Details" sw="Taarifa za Benki" icon={<CreditCard className="h-4 w-4" />} />
          <FormField label={<>Bank Name <span className="text-muted-foreground text-xs">(Jina la Benki)</span></>} required error={errors.bankName}>
            <Input value={bankName} onChange={e => setBankName(e.target.value)} onBlur={() => touch('bankName')} className={inputCls('bankName')} placeholder="e.g. CRDB Bank PLC" />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={<>Branch <span className="text-muted-foreground text-xs">(Tawi)</span></>} required error={errors.bankBranch}>
              <Input value={bankBranch} onChange={e => setBankBranch(e.target.value)} onBlur={() => touch('bankBranch')} className={inputCls('bankBranch')} placeholder="Branch name" />
            </FormField>
            <FormField label={<>Account Number <span className="text-muted-foreground text-xs">(Nambari ya Akaunti)</span></>} required error={errors.bankAccount}>
              <Input value={bankAccount} onChange={e => setBankAccount(e.target.value)} onBlur={() => touch('bankAccount')} className={inputCls('bankAccount')} placeholder="Account number" />
            </FormField>
          </div>
        </div>

        {/* ── Section 5: Contact ── */}
        <div className="space-y-5 rounded-2xl border border-amber-100 bg-white px-6 py-6 shadow-sm">
          <SectionHeader number={5} en="Contact Information" sw="Mawasiliano" icon={<Phone className="h-4 w-4" />} />
          <FormField label="Contact telephone" error={errors.telephoneNumber}>
            <Input value={telephoneNumber} readOnly className="bg-gray-50 cursor-not-allowed" />
          </FormField>
        </div>

        {/* ── Section 6: Depositor signature ── */}
        <div className="space-y-5 rounded-2xl border border-amber-100 bg-white px-6 py-6 shadow-sm">
          <SectionHeader number={6} en="Depositor Declaration" sw="Tamko la Mweka Mali" icon={<User className="h-4 w-4" />} />
          <FormField label={<>Full Name (Digital Signature) <span className="text-muted-foreground text-xs">(Jina Kamili — Saini ya Kidijitali)</span></>} required error={errors.depositorFullName} hint="Your full name serves as your digital signature">
            <Input value={depositorFullName} onChange={e => setDepositorFullName(e.target.value)} onBlur={() => touch('depositorFullName')} className={inputCls('depositorFullName')} placeholder="First and Last Name" />
          </FormField>
          <FormField label={<>Date <span className="text-muted-foreground text-xs">(Tarehe)</span></>} required error={errors.depositorDate}>
            <Input value={depositorDate} onChange={e => setDepositorDate(e.target.value)} onBlur={() => touch('depositorDate')} className={inputCls('depositorDate')} type="date" max={new Date().toISOString().slice(0, 10)} />
          </FormField>
        </div>

        {/* ── Section 10: Operator fields (locked) ── */}
        <div className="space-y-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-6">
          <SectionHeader number={10} en="Warehouse Operator Section" sw="Sehemu ya Mwendeshaji wa Ghala" locked />
          <p className="text-xs text-slate-500">These fields will be completed by the warehouse operator during review.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Operator Signature">
              <LockedInput placeholder="Completed by operator" />
            </FormField>
            <FormField label="Operator Name">
              <LockedInput placeholder="Completed by operator" />
            </FormField>
          </div>
        </div>

        {/* ── Declaration checkbox ── */}
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-5">
          <p className="mb-4 text-xs leading-relaxed text-amber-800">
            I confirm that the above information is correct and has been updated to address the reviewer&apos;s feedback.
            All corrections are accurate to the best of my knowledge.
          </p>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={declarationAgreed}
              onChange={e => setDeclarationAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-amber-400 accent-amber-500"
            />
            <span className="text-sm font-semibold text-amber-900">
              I confirm the corrections are accurate and ready for resubmission.
            </span>
          </label>
          {submitAttempted.current && !declarationAgreed && (
            <p className="mt-2 text-xs font-medium text-red-600">
              You must confirm the declaration before resubmitting.
            </p>
          )}
        </div>

        {/* ── Submit ── */}
        <div className="flex gap-3 pb-10">
          <Button
            variant="secondary"
            className="flex-1"
            asChild
          >
            <Link to={`/depositor/documents/${id}`}>Cancel</Link>
          </Button>
          <Button
            className="flex-1 gap-2 bg-amber-500 hover:bg-amber-600 text-white"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Submitting…</>
            ) : (
              <><RotateCcw className="h-4 w-4" />Resubmit corrections</>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
