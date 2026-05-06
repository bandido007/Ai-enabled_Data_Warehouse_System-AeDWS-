/**
 * StaffPermissionCorrectionPage
 *
 * Pre-fills the permission form from doc.aiExtractedFields, shows the
 * reviewer's correction note, and resubmits via the FSM "resubmit" action.
 *
 * Works for both staff_permission (STAFF) and manager_permission (MANAGER)
 * document types — the resubmit target state differs but the form is identical.
 */

import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Key,
  Loader2,
  Lock,
  RotateCcw,
  User,
  Wheat,
} from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { Button }   from '@/components/ui/button'
import { Input }    from '@/components/ui/input'
import { Label }    from '@/components/ui/label'
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

// ── Dropdown options (same as form page) ─────────────────────────────────────
const DEPARTMENTS = [
  'Operations / Uendeshaji', 'Quality Control / Udhibiti wa Ubora',
  'Logistics / Usafirishaji', 'Finance / Fedha', 'Administration / Utawala',
  'Security / Usalama', 'IT / Teknolojia', 'Compliance / Uzingatiaji', 'Other / Nyingine',
]

const PERMISSION_TYPES = [
  'Commodity Access / Ufikiaji wa Bidhaa', 'Commodity Handling / Ushughulikiaji wa Bidhaa',
  'Goods Release / Kutoa Bidhaa', 'Commodity Transport / Usafirishaji wa Bidhaa',
  'Warehouse Inspection / Ukaguzi wa Ghala', 'Night Access / Ufikiaji wa Usiku',
  'Overtime Work / Kazi ya Ziada', 'Temporary Area Access / Ufikiaji wa Eneo la Muda',
  'System Access / Ufikiaji wa Mfumo', 'Other / Nyingine',
]

const COMMODITY_TYPES = [
  'Maize / Mahindi', 'Rice / Mchele', 'Paddy / Mpunga', 'Wheat / Ngano',
  'Bean / Maharagwe', 'Sesame / Ufuta', 'Sunflower / Alizeti', 'Soybean / Soya',
  'Sorghum / Mtama', 'Millet / Uwele', 'Groundnut / Karanga', 'Cashew Nut / Korosho',
  'Coffee / Kahawa', 'Cotton / Pamba', 'Other / Nyingine', 'Not Applicable / Haihusiki',
]

// ── Validation ────────────────────────────────────────────────────────────────
type FieldName =
  | 'employeeFullName' | 'employeeId' | 'department' | 'designation'
  | 'permissionType' | 'purpose' | 'dateFrom' | 'dateTo'
  | 'staffSignature' | 'requestDate'

function validateField(name: FieldName, value: string, extra?: { dateFrom?: string }): string | null {
  switch (name) {
    case 'employeeFullName':
      if (!value.trim()) return 'Full name is required'
      if (value.trim().length < 3) return 'At least 3 characters'
      return null
    case 'employeeId':
      return value.trim() ? null : 'Employee ID is required'
    case 'department':
      return value ? null : 'Department is required'
    case 'designation':
      if (!value.trim()) return 'Designation is required'
      if (value.trim().length < 2) return 'Too short'
      return null
    case 'permissionType':
      return value ? null : 'Permission type is required'
    case 'purpose':
      if (!value.trim()) return 'Purpose is required'
      if (value.trim().length < 20) return 'Provide more detail (min 20 chars)'
      return null
    case 'dateFrom':
      return value ? null : 'Start date is required'
    case 'dateTo':
      if (!value) return 'End date is required'
      if (extra?.dateFrom && value < extra.dateFrom) return 'Must be after start date'
      return null
    case 'staffSignature':
      if (!value.trim()) return 'Signature name is required'
      if (value.trim().split(' ').length < 2) return 'Provide first and last name'
      return null
    case 'requestDate':
      if (!value) return 'Request date is required'
      if (new Date(value) > new Date()) return 'Cannot be in the future'
      return null
    default:
      return null
  }
}

// ── Small UI helpers ──────────────────────────────────────────────────────────
function FormField({ label, required, children, hint, error }: {
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
  number?: number; en: string; sw: string; icon?: React.ReactNode; locked?: boolean
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
          <Lock className="h-2.5 w-2.5" />Approver fills
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
export function StaffPermissionCorrectionPage() {
  const { id }     = useParams<{ id: string }>()
  const navigate   = useNavigate()
  const { toast }  = useToast()
  const submitAttempted = useRef(false)

  const docQuery = useDocumentQuery(id, Boolean(id), false)
  const doc      = docQuery.data

  const isManagerDoc = doc?.documentTypeId === 'manager_permission'

  // ── Field state ───────────────────────────────────────────────────────────
  const [hydrated,          setHydrated]          = useState(false)
  const [employeeFullName,  setEmployeeFullName]  = useState('')
  const [employeeId,        setEmployeeId]        = useState('')
  const [department,        setDepartment]        = useState('')
  const [designation,       setDesignation]       = useState('')
  const [permissionType,    setPermissionType]    = useState('')
  const [purpose,           setPurpose]           = useState('')
  const [dateFrom,          setDateFrom]          = useState('')
  const [dateTo,            setDateTo]            = useState('')
  const [warehouseSection,  setWarehouseSection]  = useState('')
  const [commodityType,     setCommodityType]     = useState('')
  const [quantityKg,        setQuantityKg]        = useState('')
  const [staffSignature,    setStaffSignature]    = useState('')
  const [requestDate,       setRequestDate]       = useState('')
  const [declarationAgreed, setDeclarationAgreed] = useState(false)
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({})

  // Hydrate from aiExtractedFields once
  useEffect(() => {
    if (!doc || hydrated) return
    const f = (doc.aiExtractedFields ?? {}) as Record<string, string>
    setEmployeeFullName(f.employee_full_name ?? '')
    setEmployeeId(f.employee_id ?? '')
    setDepartment(f.department ?? '')
    setDesignation(f.designation ?? '')
    setPermissionType(f.permission_type ?? '')
    setPurpose(f.purpose ?? '')
    setDateFrom(f.date_from ?? '')
    setDateTo(f.date_to ?? '')
    setWarehouseSection(f.warehouse_section ?? '')
    setCommodityType(f.commodity_type ?? '')
    setQuantityKg(f.quantity_kg ?? '')
    setStaffSignature(f.staff_signature ?? '')
    setRequestDate(f.request_date ?? new Date().toISOString().slice(0, 10))
    setHydrated(true)
  }, [doc, hydrated])

  // ── Validation ────────────────────────────────────────────────────────────
  const currentValues: Record<FieldName, string> = {
    employeeFullName, employeeId, department, designation,
    permissionType, purpose, dateFrom, dateTo,
    staffSignature, requestDate,
  }

  const getError = (name: FieldName): string | null => {
    if (!touched[name] && !submitAttempted.current) return null
    return validateField(name, currentValues[name], { dateFrom })
  }

  const errors = Object.fromEntries(
    (Object.keys(currentValues) as FieldName[]).map(k => [k, getError(k)])
  ) as Partial<Record<FieldName, string | null>>

  const touch = (name: FieldName) => setTouched(prev => ({ ...prev, [name]: true }))

  const inputCls = (name: FieldName) =>
    `border-gray-300 focus:border-amber-400 focus:ring-amber-300 transition-colors ${
      errors[name] ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : ''
    }`

  // ── Mutation ──────────────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: () => {
      const allFields = Object.keys(currentValues) as FieldName[]
      setTouched(Object.fromEntries(allFields.map(f => [f, true])))
      submitAttempted.current = true

      const firstErr = allFields.find(f => validateField(f, currentValues[f], { dateFrom }))
      if (firstErr || !declarationAgreed) {
        throw new Error('Fix the validation errors above before resubmitting.')
      }

      return submitResubmit(Number(id), {
        employee_full_name: employeeFullName,
        employee_id:        employeeId,
        department,
        designation,
        permission_type:    permissionType,
        purpose,
        date_from:          dateFrom,
        date_to:            dateTo,
        warehouse_section:  warehouseSection,
        commodity_type:     commodityType,
        quantity_kg:        quantityKg,
        staff_signature:    staffSignature,
        request_date:       requestDate,
      })
    },
    onSuccess: () => {
      toast({
        title: 'Corrections submitted',
        description: isManagerDoc
          ? 'Your amended request is back with the CEO.'
          : 'Your amended request is back with the Manager.',
      })
      navigate(`/documents/${id}`)
    },
    onError: (err: Error) => {
      toast({ variant: 'destructive', title: 'Resubmission failed', description: err.message })
    },
  })

  // ── Loading / guard states ─────────────────────────────────────────────────
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
          <Link to="/documents" className="mt-4 block text-sm text-amber-600 underline">Back to documents</Link>
        </div>
      </div>
    )
  }

  if (doc.status !== 'CORRECTION_NEEDED') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-500" />
        <p className="text-base font-semibold text-gray-800">This document is not awaiting corrections.</p>
        <p className="text-sm text-gray-500">Current status: <strong>{doc.status}</strong></p>
        <Link to={`/documents/${id}`}><Button variant="secondary">View document</Button></Link>
      </div>
    )
  }

  const correctionNote = doc.currentCorrectionNote || 'A reviewer has requested changes. Please update the fields below.'
  const formLabel = isManagerDoc ? 'Manager Permission Request' : 'Staff Permission Request'

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-orange-50">

      {/* Top bar */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-amber-100 bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
        <Link to={`/documents/${id}`}>
          <Button variant="ghost" size="sm" className="gap-1.5 text-amber-700 hover:bg-amber-50">
            <ArrowLeft className="h-4 w-4" />Back
          </Button>
        </Link>
        <div className="h-5 w-px bg-amber-200" />
        <RotateCcw className="h-4 w-4 text-amber-600" />
        <span className="text-sm font-semibold text-gray-800">Correct & Resubmit — {formLabel} #{id}</span>
      </div>

      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">

        {/* ── Correction note ── */}
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
            <span className="text-sm font-bold text-red-700">Correction required — Marekebisho yanahitajika</span>
          </div>
          <p className="text-sm leading-relaxed text-red-700">{correctionNote}</p>
          <p className="mt-2 text-xs text-red-500">Review the note, update the fields below, and resubmit.</p>
        </div>

        {/* ── Form header ── */}
        <div className="overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm">
          <div className="h-2 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500" />
          <div className="px-6 py-5 text-center">
            <h1 className="text-xl font-black uppercase tracking-tight text-gray-900">{formLabel}</h1>
            <p className="mt-1 text-sm font-semibold italic text-amber-700">
              {isManagerDoc ? 'Fomu ya Ombi la Ruhusa ya Meneja' : 'Fomu ya Ombi la Ruhusa ya Mfanyakazi'}
            </p>
            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
              <RotateCcw className="h-3 w-3" />
              Correction mode — update and resubmit
            </div>
          </div>
        </div>

        {/* ── Section 1: Employee info ── */}
        <div className="space-y-5 rounded-2xl border border-amber-100 bg-white px-6 py-6 shadow-sm">
          <SectionHeader number={1} en="Employee Information" sw="Taarifa za Mfanyakazi" icon={<User className="h-4 w-4" />} />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={<>Full Name <span className="text-muted-foreground text-xs">(Jina Kamili)</span></>} required error={errors.employeeFullName}>
              <Input value={employeeFullName} onChange={e => setEmployeeFullName(e.target.value)} onBlur={() => touch('employeeFullName')} className={inputCls('employeeFullName')} placeholder="First and Last Name" />
            </FormField>
            <FormField label={<>Employee ID <span className="text-muted-foreground text-xs">(Nambari ya Mfanyakazi)</span></>} required error={errors.employeeId}>
              <Input value={employeeId} onChange={e => setEmployeeId(e.target.value)} onBlur={() => touch('employeeId')} className={inputCls('employeeId')} placeholder="e.g. EMP-2024-001" />
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={<>Department <span className="text-muted-foreground text-xs">(Idara)</span></>} required error={errors.department}>
              <Select value={department} onValueChange={v => { setDepartment(v); touch('department') }}>
                <SelectTrigger className={inputCls('department')}><SelectValue placeholder="Select department..." /></SelectTrigger>
                <SelectContent>{DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
            <FormField label={<>Job Title / Designation <span className="text-muted-foreground text-xs">(Cheo)</span></>} required error={errors.designation}>
              <Input value={designation} onChange={e => setDesignation(e.target.value)} onBlur={() => touch('designation')} className={inputCls('designation')} placeholder="e.g. Warehouse Officer" />
            </FormField>
          </div>
        </div>

        {/* ── Section 2: Permission details ── */}
        <div className="space-y-5 rounded-2xl border border-amber-100 bg-white px-6 py-6 shadow-sm">
          <SectionHeader number={2} en="Permission Details" sw="Maelezo ya Ruhusa" icon={<Key className="h-4 w-4" />} />
          <FormField label={<>Type of Permission <span className="text-muted-foreground text-xs">(Aina ya Ruhusa)</span></>} required error={errors.permissionType}>
            <Select value={permissionType} onValueChange={v => { setPermissionType(v); touch('permissionType') }}>
              <SelectTrigger className={inputCls('permissionType')}><SelectValue placeholder="Select permission type..." /></SelectTrigger>
              <SelectContent>{PERMISSION_TYPES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </FormField>
          <FormField label={<>Purpose / Justification <span className="text-muted-foreground text-xs">(Sababu / Uhalali)</span></>} required error={errors.purpose}>
            <Textarea value={purpose} onChange={e => setPurpose(e.target.value)} onBlur={() => touch('purpose')} className={`min-h-[100px] ${inputCls('purpose')}`} placeholder="Describe the reason in detail..." />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={<>Date From <span className="text-muted-foreground text-xs">(Tarehe ya Kuanza)</span></>} required error={errors.dateFrom}>
              <Input value={dateFrom} onChange={e => setDateFrom(e.target.value)} onBlur={() => touch('dateFrom')} className={inputCls('dateFrom')} type="date" />
            </FormField>
            <FormField label={<>Date To <span className="text-muted-foreground text-xs">(Tarehe ya Mwisho)</span></>} required error={errors.dateTo}>
              <Input value={dateTo} onChange={e => setDateTo(e.target.value)} onBlur={() => touch('dateTo')} className={inputCls('dateTo')} type="date" min={dateFrom || undefined} />
            </FormField>
          </div>
        </div>

        {/* ── Section 3: Warehouse & commodity ── */}
        <div className="space-y-5 rounded-2xl border border-amber-100 bg-white px-6 py-6 shadow-sm">
          <SectionHeader number={3} en="Warehouse & Commodity Details" sw="Maelezo ya Ghala na Bidhaa" icon={<Wheat className="h-4 w-4" />} />
          <FormField label={<>Warehouse Section / Area <span className="text-muted-foreground text-xs">(Sehemu ya Ghala)</span></>}>
            <Input value={warehouseSection} onChange={e => setWarehouseSection(e.target.value)} className="border-gray-300 focus:border-amber-400 focus:ring-amber-300" placeholder="e.g. Bay A, Cold Storage" />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={<>Commodity Type <span className="text-muted-foreground text-xs">(Aina ya Bidhaa)</span></>}>
              <Select value={commodityType} onValueChange={setCommodityType}>
                <SelectTrigger className="border-gray-300 focus:border-amber-400"><SelectValue placeholder="Select commodity (optional)..." /></SelectTrigger>
                <SelectContent>{COMMODITY_TYPES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
            <FormField label={<>Quantity (kg) <span className="text-muted-foreground text-xs">(Kiasi)</span></>}>
              <Input value={quantityKg} onChange={e => setQuantityKg(e.target.value)} className="border-gray-300 focus:border-amber-400" placeholder="e.g. 5000" type="number" min="0" />
            </FormField>
          </div>
        </div>

        {/* ── Section 4: Signature ── */}
        <div className="space-y-5 rounded-2xl border border-amber-100 bg-white px-6 py-6 shadow-sm">
          <SectionHeader number={4} en="Staff Declaration & Signature" sw="Tamko na Saini ya Mfanyakazi" icon={<ClipboardList className="h-4 w-4" />} />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={<>Full Name (Digital Signature) <span className="text-muted-foreground text-xs">(Jina Kamili — Saini)</span></>} required error={errors.staffSignature}>
              <Input value={staffSignature} onChange={e => setStaffSignature(e.target.value)} onBlur={() => touch('staffSignature')} className={inputCls('staffSignature')} placeholder="First and Last Name" />
            </FormField>
            <FormField label={<>Date of Request <span className="text-muted-foreground text-xs">(Tarehe ya Ombi)</span></>} required error={errors.requestDate}>
              <Input value={requestDate} onChange={e => setRequestDate(e.target.value)} onBlur={() => touch('requestDate')} className={inputCls('requestDate')} type="date" max={new Date().toISOString().slice(0, 10)} />
            </FormField>
          </div>
        </div>

        {/* ── Locked approver section ── */}
        <div className="space-y-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-6">
          <SectionHeader
            number={5}
            en={isManagerDoc ? 'CEO Authorization Section' : 'Manager & CEO Authorization Section'}
            sw={isManagerDoc ? 'Sehemu ya Idhini ya Mkurugenzi' : 'Sehemu ya Idhini ya Meneja na Mkurugenzi'}
            locked
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {!isManagerDoc && (
              <>
                <FormField label="Manager Decision"><LockedInput placeholder="Manager fills on review" /></FormField>
                <FormField label="Manager Comments"><LockedInput placeholder="Manager fills on review" /></FormField>
              </>
            )}
            <FormField label="CEO Decision"><LockedInput placeholder="CEO fills on review" /></FormField>
            <FormField label="CEO Comments"><LockedInput placeholder="CEO fills on review" /></FormField>
          </div>
        </div>

        {/* ── Declaration ── */}
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-5">
          <p className="mb-4 text-xs leading-relaxed text-amber-800">
            I confirm that I have reviewed the correction note and updated the necessary information.
            The information provided is accurate and truthful.
          </p>
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" checked={declarationAgreed} onChange={e => setDeclarationAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-amber-400 accent-amber-500" />
            <span className="text-sm font-semibold text-amber-900">
              I confirm the corrections are accurate and this request is ready for resubmission.
            </span>
          </label>
          {submitAttempted.current && !declarationAgreed && (
            <p className="mt-2 flex items-center gap-1 text-xs font-medium text-red-600">
              <AlertCircle className="h-3 w-3" />You must confirm the declaration.
            </p>
          )}
        </div>

        {/* ── Action buttons ── */}
        <div className="flex gap-3 pb-10">
          <Button variant="secondary" className="flex-1" asChild>
            <Link to={`/documents/${id}`}>Cancel</Link>
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
