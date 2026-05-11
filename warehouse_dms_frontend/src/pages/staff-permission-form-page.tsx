/**
 * StaffPermissionFormPage
 *
 * Dual-role form: STAFF submits a permission request that goes to Manager
 * first (document type: staff_permission), while MANAGER submits one that
 * goes directly to CEO (document type: manager_permission).
 *
 * Same amber color palette and bilingual labelling as the depositor form.
 */

import { useRef, useState, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Key,
  Loader2,
  Lock,
  User,
  Wheat,
} from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

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
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { useAuth }  from '@/hooks/use-auth'
import { submitFormFill, useWarehousesQuery, validateFormDraft, useLeaveBalanceQuery } from '@/lib/queries'
import type { FormValidationResult } from '@/lib/queries'
import { FormValidationModal } from '@/components/form-validation-modal'

// ── Departments ──────────────────────────────────────────────────────────────
const DEPARTMENTS = [
  'Operations / Uendeshaji',
  'Quality Control / Udhibiti wa Ubora',
  'Logistics / Usafirishaji',
  'Finance / Fedha',
  'Administration / Utawala',
  'Security / Usalama',
  'IT / Teknolojia',
  'Compliance / Uzingatiaji',
  'Other / Nyingine',
]

// ── Permission types ─────────────────────────────────────────────────────────
const PERMISSION_TYPES = [
  // ── Leave types (trigger Leave Application Details section) ──
  'Annual Leave / Likizo ya Kila Mwaka',
  'Emergency Leave / Likizo ya Dharura',
  // ── Work permissions ──
  'Commodity Access / Ufikiaji wa Bidhaa',
  'Commodity Handling / Ushughulikiaji wa Bidhaa',
  'Goods Release / Kutoa Bidhaa',
  'Commodity Transport / Usafirishaji wa Bidhaa',
  'Warehouse Inspection / Ukaguzi wa Ghala',
  'Night Access / Ufikiaji wa Usiku',
  'Overtime Work / Kazi ya Ziada',
  'Temporary Area Access / Ufikiaji wa Eneo la Muda',
  'System Access / Ufikiaji wa Mfumo',
  'Other / Nyingine',
]

// Values that trigger the Leave Application Details section
const LEAVE_PERMISSION_VALUES = [
  'Annual Leave / Likizo ya Kila Mwaka',
  'Emergency Leave / Likizo ya Dharura',
]

// ── Crop types (for commodity field) ────────────────────────────────────────
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
  // Leave-specific (only validated when isLeavePermission === true)
  | 'leaveDaysRequested' | 'addressDuringLeave' | 'phoneDuringLeave'

function validateField(name: FieldName, value: string, extra?: { dateFrom?: string; isLeave?: boolean }): string | null {
  switch (name) {
    case 'employeeFullName':
      if (!value.trim()) return 'Full name is required / Jina kamili linahitajika'
      if (value.trim().length < 3) return 'At least 3 characters / Angalau herufi 3'
      return null
    case 'employeeId':
      if (!value.trim()) return 'Employee ID is required / Nambari ya mfanyakazi inahitajika'
      return null
    case 'department':
      if (!value) return 'Department is required / Idara inahitajika'
      return null
    case 'designation':
      if (!value.trim()) return 'Designation is required / Cheo inahitajika'
      if (value.trim().length < 2) return 'Too short / Fupi sana'
      return null
    case 'permissionType':
      if (!value) return 'Permission type is required / Aina ya ruhusa inahitajika'
      return null
    case 'purpose':
      if (!value.trim()) return 'Purpose is required / Sababu inahitajika'
      if (value.trim().length < 20) return 'Please provide more detail (min 20 chars) / Toa maelezo zaidi'
      return null
    case 'dateFrom':
      if (!value) return 'Start date is required / Tarehe ya kuanza inahitajika'
      return null
    case 'dateTo': {
      if (!value) return 'End date is required / Tarehe ya mwisho inahitajika'
      if (extra?.dateFrom && value < extra.dateFrom)
        return 'End date must be after start date / Tarehe ya mwisho lazima iwe baada ya ya kuanza'
      return null
    }
    case 'staffSignature':
      if (!value.trim()) return 'Signature name is required / Jina la saini linahitajika'
      if (value.trim().split(' ').length < 2) return 'Provide first and last name / Jina na ukoo'
      return null
    case 'requestDate': {
      if (!value) return 'Request date is required / Tarehe ya ombi inahitajika'
      if (new Date(value) > new Date()) return 'Date cannot be in the future / Tarehe isizidi leo'
      return null
    }
    // ── Leave-specific (only required when isLeave flag is set) ─────────────
    case 'leaveDaysRequested':
      if (!extra?.isLeave) return null
      if (!value || Number(value) < 1) return 'Number of leave days is required / Idadi ya siku za likizo inahitajika'
      return null
    case 'addressDuringLeave':
      if (!extra?.isLeave) return null
      if (!value.trim()) return 'Address during leave is required / Anwani wakati wa likizo inahitajika'
      return null
    case 'phoneDuringLeave':
      if (!extra?.isLeave) return null
      if (!value.trim()) return 'Phone number during leave is required / Nambari ya simu wakati wa likizo inahitajika'
      return null
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

// ── Success screen ─────────────────────────────────────────────────────────────
function SuccessScreen({ documentId, isManager, isCEO }: { documentId?: number; isManager: boolean; isCEO: boolean }) {
  const nextStep = isCEO
    ? 'Your request has been submitted for administrative review.'
    : isManager
    ? 'Your request is now with the CEO for final authorization.'
    : 'Your request is now with the Manager for review. You will be notified once a decision is made.'
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <div className="rounded-full bg-emerald-100 p-5">
        <CheckCircle2 className="h-12 w-12 text-emerald-600" />
      </div>
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-gray-900">Permission request submitted!</h2>
        <p className="text-sm italic text-amber-700">Ombi la ruhusa limetumwa!</p>
      </div>
      <p className="max-w-sm text-sm text-gray-500">{nextStep}</p>
      <div className="flex gap-3">
        {documentId && (
          <Button asChild variant="secondary">
            <Link to={`/documents/${documentId}`}>View request</Link>
          </Button>
        )}
        <Button asChild className="bg-amber-500 hover:bg-amber-600 text-white">
          <Link to="/documents">Back to documents</Link>
        </Button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
/** Count Mon–Sat working days between two ISO date strings (inclusive). */
function calcWorkingDays(from: string, to: string): number | null {
  if (!from || !to) return null
  const s = new Date(from)
  const e = new Date(to)
  if (e < s) return null
  let count = 0
  const cur = new Date(s)
  while (cur <= e) {
    if (cur.getDay() !== 0) count++ // skip Sundays only
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

export function StaffPermissionFormPage() {
  const navigate  = useNavigate()
  const { toast } = useToast()
  const { primaryRole } = useAuth()
  const [searchParams] = useSearchParams()
  const isManager = primaryRole === 'MANAGER'
  const isCEO     = primaryRole === 'CEO'
  const submitAttempted = useRef(false)

  // Which document type to use
  // STAFF → staff_permission (Manager→CEO chain)
  // MANAGER or CEO → manager_permission (goes straight to CEO / admin)
  const docTypeId = (isManager || isCEO) ? 'manager_permission' : 'staff_permission'

  // Warehouse selector (optional — staff picks the warehouse this relates to)
  const warehousesQuery = useWarehousesQuery(true)
  const warehouses = warehousesQuery.data ?? []

  // ── Field state ───────────────────────────────────────────────────────────
  const [employeeFullName, setEmployeeFullName] = useState('')
  const [employeeId,       setEmployeeId]       = useState('')
  const [department,       setDepartment]       = useState('')
  const [designation,      setDesignation]      = useState('')
  const [permissionType,   setPermissionType]   = useState('')
  const [purpose,          setPurpose]          = useState('')
  const [dateFrom,         setDateFrom]         = useState('')
  const [dateTo,           setDateTo]           = useState('')
  const [warehouseSection, setWarehouseSection] = useState('')
  const [commodityType,    setCommodityType]    = useState('')
  const [quantityKg,       setQuantityKg]       = useState('')
  const [warehouseId,      setWarehouseId]      = useState<number | null>(null)
  const [staffSignature,   setStaffSignature]   = useState('')
  const [requestDate,      setRequestDate]      = useState(new Date().toISOString().slice(0, 10))
  const [declarationAgreed, setDeclarationAgreed] = useState(false)

  // ── Leave-specific state (rendered / validated only when a leave type is chosen) ──
  const [dateOfLastLeave,         setDateOfLastLeave]         = useState('')
  const [isFirstAnnualLeave,      setIsFirstAnnualLeave]      = useState(false)
  const [dateOfFirstAppointment,  setDateOfFirstAppointment]  = useState('')
  const [leaveDaysRequested,      setLeaveDaysRequested]      = useState('')
  // daysAccumulatedFromPrev is derived from the API balance below — no manual state needed
  const [addressDuringLeave,      setAddressDuringLeave]      = useState('')
  const [poBoxDuringLeave,        setPoBoxDuringLeave]        = useState('')
  const [phoneDuringLeave,        setPhoneDuringLeave]        = useState('')
  const [travelExpensesTshs,      setTravelExpensesTshs]      = useState('')

  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({})
  const [submitted, setSubmitted] = useState(false)
  const [submittedId, setSubmittedId] = useState<number | undefined>()

  // ── Validation modal state ────────────────────────────────────────────────
  const [validationModalOpen, setValidationModalOpen] = useState(false)
  const [validationResult, setValidationResult] = useState<FormValidationResult | null>(null)

  // ── Validation ────────────────────────────────────────────────────────────
  const isLeavePermission = LEAVE_PERMISSION_VALUES.includes(permissionType)

  // ── Pre-select leave type from URL param (?leaveType=annual|emergency) ────
  useEffect(() => {
    const param = searchParams.get('leaveType')
    if (!param) return
    if (param === 'emergency') {
      setPermissionType('Emergency Leave / Likizo ya Dharura')
    } else {
      setPermissionType('Annual Leave / Likizo ya Kila Mwaka')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Live leave balance (fetched only when a leave type is selected) ────────
  const leaveBalanceQuery = useLeaveBalanceQuery(isLeavePermission)
  const leaveBalance = leaveBalanceQuery.data
  // Days accumulated from previous period = remaining from current balance snapshot
  const daysAccumulatedFromPrev = leaveBalance ? String(leaveBalance.daysRemaining) : ''

  // ── Auto-calculate working days (Mon–Sat) from date range ─────────────────
  const estimatedDays = calcWorkingDays(dateFrom, dateTo)

  // Keep leaveDaysRequested in sync with estimated days
  useEffect(() => {
    if (isLeavePermission && estimatedDays !== null) {
      setLeaveDaysRequested(String(estimatedDays))
    }
  }, [isLeavePermission, estimatedDays])

  const overBalance =
    leaveBalance && estimatedDays !== null && estimatedDays > leaveBalance.daysRemaining

  const currentValues: Record<FieldName, string> = {
    employeeFullName, employeeId, department, designation,
    permissionType, purpose, dateFrom, dateTo,
    staffSignature, requestDate,
    leaveDaysRequested, addressDuringLeave, phoneDuringLeave,
  }

  const getError = (name: FieldName): string | null => {
    if (!touched[name] && !submitAttempted.current) return null
    return validateField(name, currentValues[name], { dateFrom, isLeave: isLeavePermission })
  }

  const errors = Object.fromEntries(
    (Object.keys(currentValues) as FieldName[]).map(k => [k, getError(k)])
  ) as Partial<Record<FieldName, string | null>>

  const touch = (name: FieldName) => setTouched(prev => ({ ...prev, [name]: true }))

  const inputCls = (name: FieldName) =>
    `border-gray-300 focus:border-amber-400 focus:ring-amber-300 transition-colors ${
      errors[name] ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : ''
    }`

  // ── AI Validation ─────────────────────────────────────────────────────────
  const validationMutation = useMutation({
    mutationFn: () => {
      return validateFormDraft({
        documentTypeId: docTypeId,
        fields: {
          employee_full_name:  employeeFullName,
          employee_id:         employeeId,
          department,
          designation,
          permission_type:     permissionType,
          purpose,
          date_from:           dateFrom,
          date_to:             dateTo,
          staff_signature:     staffSignature,
          request_date:        requestDate,
          ...(isLeavePermission ? {
            leave_days_requested:   leaveDaysRequested,
            address_during_leave:   addressDuringLeave,
            phone_during_leave:     phoneDuringLeave,
          } : {}),
        },
      })
    },
    onSuccess: (result) => {
      setValidationResult(result)
      setValidationModalOpen(true)
    },
    onError: (err: Error) => {
      toast({ variant: 'destructive', title: 'Validation Failed', description: err.message })
    },
  })

  // ── Submission ────────────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: () => {
      const allFields = Object.keys(currentValues) as FieldName[]
      setTouched(Object.fromEntries(allFields.map(f => [f, true])))
      submitAttempted.current = true

      const firstErr = allFields.find(f => validateField(f, currentValues[f], { dateFrom, isLeave: isLeavePermission }))
      if (firstErr || !declarationAgreed) {
        throw new Error('Please fix the errors above before submitting.')
      }

      if (!warehouseId) {
        throw new Error('Please select a warehouse this request relates to.')
      }

      const title = `${isManager ? 'Manager' : 'Staff'} Permission Request — ${permissionType.split('/')[0].trim()} — ${employeeFullName}`

      return submitFormFill({
        documentTypeId: docTypeId,
        warehouseId,
        title,
        fields: {
          employee_full_name:  employeeFullName,
          employee_id:         employeeId,
          department,
          designation,
          permission_type:     permissionType,
          purpose,
          date_from:           dateFrom,
          date_to:             dateTo,
          warehouse_section:   warehouseSection,
          commodity_type:      commodityType,
          quantity_kg:         quantityKg,
          staff_signature:     staffSignature,
          request_date:        requestDate,
          // Leave-specific fields (only included when a leave type is selected)
          ...(isLeavePermission ? {
            date_of_last_leave:          dateOfLastLeave,
            is_first_annual_leave:       String(isFirstAnnualLeave),
            date_of_first_appointment:   dateOfFirstAppointment,
            leave_days_requested:        leaveDaysRequested,
            days_accumulated_from_prev:  daysAccumulatedFromPrev,
            address_during_leave:        addressDuringLeave,
            po_box_during_leave:         poBoxDuringLeave,
            phone_during_leave:          phoneDuringLeave,
            travel_expenses_tshs:        travelExpensesTshs,
          } : {}),
        },
      })
    },
    onSuccess: (doc) => {
      setSubmittedId(doc.id)
      setSubmitted(true)
    },
    onError: (err: Error) => {
      toast({ variant: 'destructive', title: 'Submission failed', description: err.message })
    },
  })

  // ── Success screen ────────────────────────────────────────────────────────
  if (submitted) {
    return <SuccessScreen documentId={submittedId} isManager={isManager} isCEO={isCEO} />
  }

  const formTitle   = isCEO    ? 'CEO Permission Request Form'
                    : isManager ? 'Manager Permission Request Form'
                    : 'Staff Permission Request Form'
  const formTitleSw = isCEO    ? 'Fomu ya Ombi la Ruhusa ya Mkurugenzi Mkuu'
                    : isManager ? 'Fomu ya Ombi la Ruhusa ya Meneja'
                    : 'Fomu ya Ombi la Ruhusa ya Mfanyakazi'
  const formNumber  = isCEO ? 'CP-1' : isManager ? 'MP-1' : 'SP-1'
  const routeBadge  = isCEO    ? 'Submitted → Admin for authorization'
                    : isManager ? 'Submitted → CEO for authorization'
                    : 'Submitted → Manager → CEO for authorization'

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-orange-50">

      {/* Top bar */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-amber-100 bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
        <Button variant="ghost" size="sm" className="gap-1.5 text-amber-700 hover:bg-amber-50" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />Back
        </Button>
        <div className="h-5 w-px bg-amber-200" />
        <Key className="h-4 w-4 text-amber-600" />
        <span className="text-sm font-semibold text-gray-800">{formTitle}</span>
      </div>

      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">

        {/* ── Official header ── */}
        <div className="overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm">
          <div className="h-2 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500" />
          <div className="px-6 py-6">
            <div className="flex items-start justify-between">
              <div className="space-y-0.5">
                <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                  Tanzania Warehouse Licensing Board
                </p>
                <p className="text-[10px] italic text-amber-600">
                  Bodi ya Leseni za Maghala Tanzania
                </p>
              </div>
              <div className="ml-4 shrink-0 text-right">
                <p className="text-[10px] text-muted-foreground">FOMU / FORM</p>
                <p className="text-2xl font-black text-amber-600">{formNumber}</p>
              </div>
            </div>
            <div className="mt-4 border-y border-amber-100 py-4 text-center">
              <h1 className="text-xl font-black uppercase tracking-tight text-gray-900">
                {formTitle}
              </h1>
              <p className="mt-1 text-sm font-semibold italic text-amber-700">{formTitleSw}</p>
              <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-semibold text-amber-800">
                <ClipboardCheck className="h-3 w-3" />
                {routeBadge}
              </div>
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

          <FormField label={isLeavePermission ? <>Reason for Leave <span className="text-muted-foreground text-xs">(Sababu ya Likizo)</span></> : <>Purpose / Justification <span className="text-muted-foreground text-xs">(Sababu / Uhalali)</span></>} required error={errors.purpose} hint="Explain the reason in detail — at least 20 characters">
            <Textarea value={purpose} onChange={e => setPurpose(e.target.value)} onBlur={() => touch('purpose')} className={`min-h-[100px] ${inputCls('purpose')}`} placeholder="Describe the reason for this permission request in detail..." />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={isLeavePermission ? <>Leave Start Date <span className="text-muted-foreground text-xs">(Tarehe ya Kuanza Likizo)</span></> : <>Date From <span className="text-muted-foreground text-xs">(Tarehe ya Kuanza)</span></>} required error={errors.dateFrom}>
              <Input value={dateFrom} onChange={e => setDateFrom(e.target.value)} onBlur={() => touch('dateFrom')} className={inputCls('dateFrom')} type="date" />
            </FormField>
            <FormField label={isLeavePermission ? <>Return / Report on Duty Date <span className="text-muted-foreground text-xs">(Tarehe ya Kurudi Kazini)</span></> : <>Date To <span className="text-muted-foreground text-xs">(Tarehe ya Mwisho)</span></>} required error={errors.dateTo}>
              <Input value={dateTo} onChange={e => setDateTo(e.target.value)} onBlur={() => touch('dateTo')} className={inputCls('dateTo')} type="date" min={dateFrom || undefined} />
            </FormField>
          </div>
        </div>

        {/* ── Section 3 (conditional): Leave Application Details ─────────── */}
        {isLeavePermission && (
          <div className="space-y-5 rounded-2xl border-2 border-amber-300 bg-amber-50 px-6 py-6 shadow-sm">
            <SectionHeader
              number={3}
              en="Leave Application Details"
              sw="Maelezo ya Ombi la Likizo"
              icon={<ClipboardList className="h-4 w-4" />}
            />
            <p className="-mt-2 text-xs text-amber-700 italic">
              Leave balance details are calculated automatically — no manual entry required /
              Maelezo ya salio la likizo yanakokotolewa kiotomatiki — hakuna uingizaji wa mikono unaohitajika
            </p>

            {/* ── Auto-calculated balance strip ─────────────────────────── */}
            <div className="rounded-xl border-2 border-amber-200 bg-white p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-amber-800">
                <CalendarDays className="h-4 w-4" />
                Leave Balance — {leaveBalance?.year ?? new Date().getFullYear()}
                <span className="ml-auto text-[10px] font-normal text-amber-600 uppercase tracking-wide">
                  Auto-calculated / Inakokotolewa kiotomatiki
                </span>
              </div>

              {leaveBalanceQuery.isLoading ? (
                <div className="grid grid-cols-3 gap-2 animate-pulse">
                  {[0,1,2].map(i => <div key={i} className="h-14 rounded-lg bg-amber-100" />)}
                </div>
              ) : leaveBalance ? (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-center">
                      <div className="text-xl font-black text-amber-700">{leaveBalance.annualDays}</div>
                      <div className="text-[10px] uppercase tracking-wide text-amber-600 mt-0.5">Annual Days<br/><span className="italic">Siku za Mwaka</span></div>
                    </div>
                    <div className="rounded-lg bg-orange-50 border border-orange-200 p-2 text-center">
                      <div className="text-xl font-black text-orange-600">{leaveBalance.daysUsed}</div>
                      <div className="text-[10px] uppercase tracking-wide text-orange-500 mt-0.5">Days Used<br/><span className="italic">Zilizotumika</span></div>
                    </div>
                    <div className="rounded-lg border p-2 text-center" style={{ background: leaveBalance.daysRemaining === 0 ? '#fef2f2' : '#f0fdf4', borderColor: leaveBalance.daysRemaining === 0 ? '#fca5a5' : '#86efac' }}>
                      <div className={`text-xl font-black ${leaveBalance.daysRemaining === 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {leaveBalance.daysRemaining}
                      </div>
                      <div className={`text-[10px] uppercase tracking-wide mt-0.5 ${leaveBalance.daysRemaining === 0 ? 'text-red-500' : 'text-green-600'}`}>
                        Remaining<br/><span className="italic">Zilizobaki</span>
                      </div>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {leaveBalance.annualDays > 0 && (
                    <div>
                      <div className="flex justify-between text-[10px] text-amber-700 mb-1">
                        <span>Used {Math.round((leaveBalance.daysUsed / leaveBalance.annualDays) * 100)}%</span>
                        <span>{leaveBalance.daysUsed} / {leaveBalance.annualDays} days</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-amber-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            leaveBalance.daysUsed >= leaveBalance.annualDays
                              ? 'bg-red-500' : leaveBalance.daysUsed / leaveBalance.annualDays >= 0.75
                              ? 'bg-yellow-500' : 'bg-green-500'
                          }`}
                          style={{ width: `${Math.min((leaveBalance.daysUsed / leaveBalance.annualDays) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </>
              ) : null}

              {/* Days being applied for — auto-calculated from date range */}
              {estimatedDays !== null && (
                <div className={`rounded-lg border px-3 py-2.5 text-sm ${
                  overBalance
                    ? 'border-red-200 bg-red-50 text-red-800'
                    : 'border-green-200 bg-green-50 text-green-800'
                }`}>
                  {overBalance ? (
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">
                          Emergency request: {estimatedDays} working days requested — exceeds your remaining balance of{' '}
                          {leaveBalance?.daysRemaining} day{leaveBalance?.daysRemaining !== 1 ? 's' : ''}.
                        </p>
                        <p className="text-xs mt-0.5 italic">
                          Ombi la dharura: Siku {estimatedDays} zilizoombwa zinazidi salio lako la siku {leaveBalance?.daysRemaining}.
                        </p>
                        <p className="text-xs mt-1 font-medium">
                          Your manager will review the reason you provide below before deciding.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 shrink-0" />
                      <span>
                        <strong>{estimatedDays} working days</strong> (Mon–Sat) will be deducted from your balance.{' '}
                        <span className="text-[11px] italic">Siku {estimatedDays} za kazi (Jumatatu–Jumamosi) zitakatwa.</span>
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Date of last leave (optional context) */}
            <FormField label={<>Date of Last Leave <span className="text-muted-foreground text-xs">(Tarehe ya Likizo Iliyopita — optional)</span></>}>
              <Input
                value={dateOfLastLeave}
                onChange={e => setDateOfLastLeave(e.target.value)}
                className="border-gray-300 focus:border-amber-400 focus:ring-amber-300"
                type="date"
              />
            </FormField>

            {/* First annual leave checkbox */}
            <div className="rounded-lg border border-amber-200 bg-white px-4 py-3">
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={isFirstAnnualLeave}
                  onChange={e => setIsFirstAnnualLeave(e.target.checked)}
                  className="h-4 w-4 rounded border-amber-400 accent-amber-500"
                />
                <span className="text-sm font-semibold text-gray-800">
                  This is my first annual leave
                  <span className="ml-1 text-xs font-normal italic text-amber-600">(Hii ni Likizo yangu ya Kwanza ya Kila Mwaka)</span>
                </span>
              </label>
              {isFirstAnnualLeave && (
                <div className="mt-3">
                  <FormField label={<>Date of First Appointment <span className="text-muted-foreground text-xs">(Tarehe ya Uteuzi wa Kwanza)</span></>}>
                    <Input
                      value={dateOfFirstAppointment}
                      onChange={e => setDateOfFirstAppointment(e.target.value)}
                      className="border-gray-300 focus:border-amber-400 focus:ring-amber-300"
                      type="date"
                    />
                  </FormField>
                </div>
              )}
            </div>

            {/* Address during leave */}
            <FormField
              label={<>Address While on Leave <span className="text-muted-foreground text-xs">(Anwani Wakati wa Likizo)</span></>}
              required
              error={errors.addressDuringLeave}
            >
              <Textarea
                value={addressDuringLeave}
                onChange={e => { setAddressDuringLeave(e.target.value); touch('addressDuringLeave') }}
                onBlur={() => touch('addressDuringLeave')}
                className={`min-h-[80px] ${inputCls('addressDuringLeave')}`}
                placeholder="Street address, district, region..."
              />
            </FormField>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={<>P.O. Box <span className="text-muted-foreground text-xs">(Sanduku la Posta)</span></>}>
                <Input
                  value={poBoxDuringLeave}
                  onChange={e => setPoBoxDuringLeave(e.target.value)}
                  className="border-gray-300 focus:border-amber-400 focus:ring-amber-300"
                  placeholder="e.g. P.O. Box 1234, Dodoma"
                />
              </FormField>
              <FormField
                label={<>Phone / Mobile No. During Leave <span className="text-muted-foreground text-xs">(Simu wakati wa Likizo)</span></>}
                required
                error={errors.phoneDuringLeave}
              >
                <Input
                  value={phoneDuringLeave}
                  onChange={e => { setPhoneDuringLeave(e.target.value); touch('phoneDuringLeave') }}
                  onBlur={() => touch('phoneDuringLeave')}
                  className={inputCls('phoneDuringLeave')}
                  type="tel"
                  placeholder="e.g. +255 712 345 678"
                />
              </FormField>
            </div>

            {/* Travel expenses */}
            <FormField
              label={<>Entitled Travel Expenses (Tshs) <span className="text-muted-foreground text-xs">(Posho ya Usafiri — optional)</span></>}
              hint="As per WRRB Human Resources Regulations / Kulingana na Kanuni za Rasilimali Watu za WRRB"
            >
              <Input
                value={travelExpensesTshs}
                onChange={e => setTravelExpensesTshs(e.target.value)}
                className="border-gray-300 focus:border-amber-400 focus:ring-amber-300"
                type="number" min="0" placeholder="e.g. 150000"
              />
            </FormField>
          </div>
        )}

        {/* ── Section 4: Warehouse & commodity ── */}
        <div className="space-y-5 rounded-2xl border border-amber-100 bg-white px-6 py-6 shadow-sm">
          <SectionHeader number={3} en="Warehouse & Commodity Details" sw="Maelezo ya Ghala na Bidhaa" icon={<Wheat className="h-4 w-4" />} />

          <FormField
            label={<>Warehouse <span className="text-muted-foreground text-xs">(Ghala — required)</span></>}
            required
            error={submitAttempted.current && !warehouseId ? 'Please select a warehouse' : null}
          >
            <Select
              value={warehouseId !== null ? String(warehouseId) : ''}
              onValueChange={v => setWarehouseId(Number(v))}
            >
              <SelectTrigger className={`border-gray-300 ${submitAttempted.current && !warehouseId ? 'border-red-400' : ''}`}>
                <SelectValue placeholder={warehousesQuery.isLoading ? 'Loading warehouses…' : 'Select warehouse…'} />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map(w => (
                  <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label={<>Warehouse Section / Area <span className="text-muted-foreground text-xs">(Sehemu ya Ghala — optional)</span></>}>
            <Input value={warehouseSection} onChange={e => setWarehouseSection(e.target.value)} className="border-gray-300 focus:border-amber-400 focus:ring-amber-300" placeholder="e.g. Bay A, Cold Storage, Loading Dock" />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={<>Commodity Type <span className="text-muted-foreground text-xs">(Aina ya Bidhaa — optional)</span></>}>
              <Select value={commodityType} onValueChange={setCommodityType}>
                <SelectTrigger className="border-gray-300 focus:border-amber-400 focus:ring-amber-300"><SelectValue placeholder="Select commodity (optional)..." /></SelectTrigger>
                <SelectContent>{COMMODITY_TYPES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
            <FormField label={<>Quantity (kg) <span className="text-muted-foreground text-xs">(Kiasi — optional)</span></>}>
              <Input value={quantityKg} onChange={e => setQuantityKg(e.target.value)} className="border-gray-300 focus:border-amber-400 focus:ring-amber-300" placeholder="e.g. 5000" type="number" min="0" />
            </FormField>
          </div>
        </div>

        {/* ── Section 5: Staff declaration ── */}
        <div className="space-y-5 rounded-2xl border border-amber-100 bg-white px-6 py-6 shadow-sm">
          <SectionHeader number={5} en="Staff Declaration & Signature" sw="Tamko na Saini ya Mfanyakazi" icon={<ClipboardList className="h-4 w-4" />} />

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={<>Full Name (Digital Signature) <span className="text-muted-foreground text-xs">(Jina Kamili — Saini ya Kidijitali)</span></>} required error={errors.staffSignature} hint="Your full name acts as your digital signature">
              <Input value={staffSignature} onChange={e => setStaffSignature(e.target.value)} onBlur={() => touch('staffSignature')} className={inputCls('staffSignature')} placeholder="First and Last Name" />
            </FormField>
            <FormField label={<>Date of Request <span className="text-muted-foreground text-xs">(Tarehe ya Ombi)</span></>} required error={errors.requestDate}>
              <Input value={requestDate} onChange={e => setRequestDate(e.target.value)} onBlur={() => touch('requestDate')} className={inputCls('requestDate')} type="date" max={new Date().toISOString().slice(0, 10)} />
            </FormField>
          </div>
        </div>

        {/* ── Section 6: Approver sections (locked) ── */}
        <div className="space-y-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-6">
          <SectionHeader
            number={6}
            en={isCEO ? 'Admin Authorization Section' : isManager ? 'CEO Authorization Section' : 'Manager & CEO Authorization Section'}
            sw={isCEO ? 'Sehemu ya Idhini ya Utawala' : isManager ? 'Sehemu ya Idhini ya Mkurugenzi' : 'Sehemu ya Idhini ya Meneja na Mkurugenzi'}
            locked
          />
          <p className="text-xs text-slate-500">
            {isCEO
              ? 'This section will be completed by the administrator during review.'
              : isManager
              ? 'This section will be completed by the CEO during review.'
              : 'These sections will be completed by the Manager and CEO during review.'}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {!isManager && !isCEO && (
              <>
                <FormField label="Manager Decision">
                  <LockedInput placeholder="Manager fills on review" />
                </FormField>
                <FormField label="Manager Comments">
                  <LockedInput placeholder="Manager fills on review" />
                </FormField>
              </>
            )}
            {!isCEO && (
              <>
                <FormField label="CEO Decision">
                  <LockedInput placeholder="CEO fills on review" />
                </FormField>
                <FormField label="CEO Comments">
                  <LockedInput placeholder="CEO fills on review" />
                </FormField>
              </>
            )}
            {isCEO && (
              <>
                <FormField label="Admin Decision">
                  <LockedInput placeholder="Admin fills on review" />
                </FormField>
                <FormField label="Admin Comments">
                  <LockedInput placeholder="Admin fills on review" />
                </FormField>
              </>
            )}
          </div>
        </div>

        {/* ── Declaration checkbox ── */}
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-5">
          <p className="mb-4 text-xs leading-relaxed text-amber-800">
            I hereby declare that the information provided in this form is accurate and truthful.
            I understand that submitting false information may result in disciplinary action.
          </p>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={declarationAgreed}
              onChange={e => setDeclarationAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-amber-400 accent-amber-500"
            />
            <span className="text-sm font-semibold text-amber-900">
              I confirm this request is accurate and I take responsibility for the information provided.
            </span>
          </label>
          {submitAttempted.current && !declarationAgreed && (
            <p className="mt-2 flex items-center gap-1 text-xs font-medium text-red-600">
              <AlertCircle className="h-3 w-3" />
              You must confirm the declaration before submitting.
            </p>
          )}
        </div>

        {/* ── Action buttons ── */}
        <div className="sticky bottom-4 z-10">
          <div className="bg-white/90 backdrop-blur rounded-2xl border border-amber-200 shadow-lg px-6 py-4 flex items-center justify-between gap-4">
            <div className="text-sm">
              {employeeFullName.trim() && permissionType && purpose.trim().length >= 20 && dateFrom && dateTo && staffSignature.trim() && declarationAgreed ? (
                <span className="text-green-700 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Ready to submit / Tayari kutuma
                </span>
              ) : (
                <span className="text-amber-700">
                  {!declarationAgreed
                    ? 'Accept the declaration / Kubali azimio'
                    : 'Fill all required fields / Jaza sehemu zote'}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => validationMutation.mutate()}
                disabled={validationMutation.isPending || !employeeFullName.trim()}
                className="gap-2"
              >
                {validationMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Validating…</>
                ) : (
                  <>📋 Validate Form</>
                )}
              </Button>
              <Button
                className="gap-2 bg-amber-500 hover:bg-amber-600 text-white"
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
              >
                {mutation.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Submitting…</>
                ) : (
                  <><ClipboardCheck className="h-4 w-4" />Submit Request</>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* spacer so sticky bar doesn't overlap last section */}
        <div className="pb-6" />
      </div>

      {/* Validation modal */}
      <FormValidationModal
        open={validationModalOpen}
        result={validationResult}
        loading={validationMutation.isPending}
        onClose={() => setValidationModalOpen(false)}
        onRevalidate={() => validationMutation.mutate()}
        onSubmitAnyway={() => {
          setValidationModalOpen(false)
          mutation.mutate()
        }}
      />
    </div>
  )
}
