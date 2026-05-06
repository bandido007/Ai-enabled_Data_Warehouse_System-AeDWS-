import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Lock,
  Loader2,
  Phone,
  User,
  Wheat,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

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
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { submitFormFill, validateFormDraft, useWarehousesQuery } from '@/lib/queries'
import { FormValidationModal } from '@/components/form-validation-modal'
import type { FormValidationResult } from '@/lib/queries'

// ── Tanzania crop types ──────────────────────────────────────────────────────
const CROP_TYPES = [
  'Maize / Mahindi',
  'Rice / Mchele',
  'Paddy / Mpunga',
  'Wheat / Ngano',
  'Bean / Maharagwe',
  'Sesame / Ufuta',
  'Sunflower / Alizeti',
  'Soybean / Soya',
  'Sorghum / Mtama',
  'Millet / Uwele',
  'Groundnut / Karanga',
  'Cashew Nut / Korosho',
  'Coffee / Kahawa',
  'Cotton / Pamba',
  'Other / Nyingine',
]

// ── Validation rules ─────────────────────────────────────────────────────────
const TZ_PHONE = /^(\+255|0)[67]\d{8}$/

function validateField(name: string, value: string): string | null {
  switch (name) {
    case 'businessName':
      if (!value.trim()) return 'Business name is required / Jina la biashara linahitajika'
      if (value.trim().length < 3) return 'Must be at least 3 characters / Angalau herufi 3'
      return null

    case 'physicalAddress':
      if (!value.trim()) return 'Address is required / Anuani inahitajika'
      if (value.trim().length < 10) return 'Please provide a full address / Toa anuani kamili'
      return null

    case 'telephoneNumber':
      if (!value.trim()) return 'Telephone is required / Namba ya simu inahitajika'
      if (!TZ_PHONE.test(value.replace(/\s/g, '')))
        return 'Enter a valid Tanzanian number (e.g. +255 712 345 678) / Ingiza namba halisi ya Tanzania'
      return null

    case 'authorizedSignatoryName':
      if (!value.trim()) return 'Signatory name is required / Jina la msaini linahitajika'
      if (value.trim().length < 3) return 'Must be at least 3 characters / Angalau herufi 3'
      if (/\d/.test(value)) return 'Name should not contain numbers / Jina lisiwe na nambari'
      return null

    case 'cropType':
      if (!value) return 'Please select a crop type / Chagua aina ya zao'
      return null

    case 'storageQuantityKg':
      if (!value.trim()) return 'Quantity is required / Kiasi kinahitajika'
      if (isNaN(Number(value)) || Number(value) <= 0)
        return 'Enter a positive number in kg / Ingiza nambari chanya kwa kilo'
      if (Number(value) > 10_000_000)
        return 'Value seems too large — max 10,000,000 kg / Thamani kubwa mno'
      return null

    case 'bankName':
      if (!value.trim()) return 'Bank name is required / Jina la benki linahitajika'
      return null

    case 'bankBranch':
      if (!value.trim()) return 'Branch is required / Tawi linahitajika'
      return null

    case 'bankAccount':
      if (!value.trim()) return 'Account number is required / Namba ya akaunti inahitajika'
      if (value.trim().length < 6) return 'Account number too short / Namba fupi mno'
      if (!/^[A-Za-z0-9\-\/]+$/.test(value.trim()))
        return 'Only letters, digits, hyphens / Herufi, nambari, na kistari tu'
      return null

    case 'depositorFullName':
      if (!value.trim()) return 'Full name is required / Jina kamili linahitajika'
      if (value.trim().length < 3) return 'Must be at least 3 characters / Angalau herufi 3'
      if (/\d/.test(value)) return 'Name should not contain numbers / Jina lisiwe na nambari'
      return null

    case 'depositorDate': {
      if (!value) return 'Date is required / Tarehe inahitajika'
      const d = new Date(value)
      const today = new Date(); today.setHours(23, 59, 59, 999)
      if (d > today) return 'Date cannot be in the future / Tarehe haiwezi kuwa ya baadaye'
      // Must be within last 30 days
      const oldest = new Date(); oldest.setDate(oldest.getDate() - 30)
      if (d < oldest) return 'Date must be within the last 30 days / Tarehe ndani ya siku 30 zilizopita'
      return null
    }

    default:
      return null
  }
}

// ── Component helpers ────────────────────────────────────────────────────────

interface FieldProps {
  label: React.ReactNode
  required?: boolean
  children: React.ReactNode
  hint?: string
  error?: string | null
}

function FormField({ label, required, children, hint, error }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-semibold text-gray-800 leading-snug">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      {children}
      {error ? (
        <p className="flex items-center gap-1 text-xs text-red-600 font-medium">
          <AlertCircle className="w-3 h-3 shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

function SectionHeader({
  number,
  en,
  sw,
  icon,
  locked,
}: {
  number?: number
  en: string
  sw: string
  icon?: React.ReactNode
  locked?: boolean
}) {
  return (
    <div className="flex items-start gap-3 pb-3 border-b border-amber-200">
      {icon && <div className="mt-0.5 text-amber-600 shrink-0">{icon}</div>}
      <div className="flex-1">
        <div className="flex items-center gap-2">
          {number !== undefined && (
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-800 text-xs font-bold shrink-0">
              {number}
            </span>
          )}
          <p className="font-bold text-gray-900 text-sm leading-tight">{en}</p>
        </div>
        <p className="text-xs text-amber-700 italic mt-0.5 ml-8">{sw}</p>
      </div>
      {locked && (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5 shrink-0">
          <Lock className="w-2.5 h-2.5" />
          Operator fills
        </span>
      )}
    </div>
  )
}

function LockedInput({ placeholder }: { placeholder: string }) {
  return (
    <div className="flex items-center h-10 rounded-md border border-dashed border-gray-300 bg-gray-50 px-3 text-xs text-gray-400 italic select-none cursor-not-allowed">
      <Lock className="w-3 h-3 mr-2 shrink-0 text-gray-300" />
      {placeholder}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Main page
// ────────────────────────────────────────────────────────────────────────────

type FieldName =
  | 'businessName' | 'physicalAddress' | 'telephoneNumber' | 'authorizedSignatoryName'
  | 'cropType' | 'storageQuantityKg' | 'bankName' | 'bankBranch' | 'bankAccount'
  | 'depositorFullName' | 'depositorDate'

type Touched = Partial<Record<FieldName, boolean>>
type Errors  = Partial<Record<FieldName, string | null>>

export function DepositorRegistrationFormPage() {
  const navigate  = useNavigate()
  const { toast } = useToast()
  const warehousesQuery = useWarehousesQuery(true)
  const warehouses = warehousesQuery.data ?? []
  const submitAttempted = useRef(false)

  // ── Field values ─────────────────────────────────────────────────────────
  const [warehouseId,             setWarehouseId]            = useState<number | null>(null)
  const [businessName,            setBusinessName]           = useState('')
  const [physicalAddress,         setPhysicalAddress]        = useState('')
  const [telephoneNumber,         setTelephoneNumber]        = useState('')
  const [authorizedSignatoryName, setAuthorizedSignatoryName]= useState('')
  const [cropType,                setCropType]               = useState('')
  const [storageQuantityKg,       setStorageQuantityKg]      = useState('')
  const [bankName,                setBankName]               = useState('')
  const [bankBranch,              setBankBranch]             = useState('')
  const [bankAccount,             setBankAccount]            = useState('')
  const [depositorFullName,       setDepositorFullName]      = useState('')
  const [depositorDate,           setDepositorDate]          = useState('')
  const [declarationAgreed,       setDeclarationAgreed]      = useState(false)

  // ── Touched & error state ────────────────────────────────────────────────
  const [touched, setTouched] = useState<Touched>({})

  // ── Form validation state ────────────────────────────────────────────────
  const [validationModalOpen, setValidationModalOpen] = useState(false)
  const [validationResult, setValidationResult] = useState<FormValidationResult | null>(null)

  const getError = (name: FieldName, value: string): string | null => {
    if (!touched[name] && !submitAttempted.current) return null
    return validateField(name, value)
  }

  const errors: Errors = {
    businessName:            getError('businessName',            businessName),
    physicalAddress:         getError('physicalAddress',         physicalAddress),
    telephoneNumber:         getError('telephoneNumber',         telephoneNumber),
    authorizedSignatoryName: getError('authorizedSignatoryName', authorizedSignatoryName),
    cropType:                getError('cropType',                cropType),
    storageQuantityKg:       getError('storageQuantityKg',       storageQuantityKg),
    bankName:                getError('bankName',                bankName),
    bankBranch:              getError('bankBranch',              bankBranch),
    bankAccount:             getError('bankAccount',             bankAccount),
    depositorFullName:       getError('depositorFullName',       depositorFullName),
    depositorDate:           getError('depositorDate',           depositorDate),
  }

  const touch = (name: FieldName) =>
    setTouched(prev => ({ ...prev, [name]: true }))

  const hasErrors = Object.values(errors).some(Boolean)
  const warehouseError = (submitAttempted.current && !warehouseId)
    ? 'Please select a warehouse / Chagua ghala' : null

  const isFormValid = !hasErrors && !warehouseError &&
    !!warehouseId && declarationAgreed &&
    businessName.trim() && physicalAddress.trim() && telephoneNumber.trim() &&
    authorizedSignatoryName.trim() && cropType && storageQuantityKg.trim() &&
    bankName.trim() && bankBranch.trim() && bankAccount.trim() &&
    depositorFullName.trim() && depositorDate

  // ── Submission ───────────────────────────────────────────────────────────
  const validationMutation = useMutation({
    mutationFn: () => {
      return validateFormDraft({
        documentTypeId: 'depositor_registration',
        fields: {
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
          warehouse_operator_signature: '',
          warehouse_operator_name: ''
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

  const mutation = useMutation({
    mutationFn: () => {
      // touch all fields on submit
      const allFields: FieldName[] = [
        'businessName','physicalAddress','telephoneNumber','authorizedSignatoryName',
        'cropType','storageQuantityKg','bankName','bankBranch','bankAccount',
        'depositorFullName','depositorDate',
      ]
      setTouched(Object.fromEntries(allFields.map(f => [f, true])) as Touched)
      submitAttempted.current = true

      // Re-compute errors after marking all touched
      const firstError = allFields.find(f =>
        validateField(f, {
          businessName, physicalAddress, telephoneNumber, authorizedSignatoryName,
          cropType, storageQuantityKg, bankName, bankBranch, bankAccount,
          depositorFullName, depositorDate,
        }[f] ?? '')
      )
      if (firstError || !warehouseId || !declarationAgreed) {
        throw new Error('Please fix validation errors before submitting / Sahihisha makosa kabla ya kutuma')
      }

      return submitFormFill({
        documentTypeId: 'depositor_registration',
        warehouseId: warehouseId!,
        title: `Depositor Registration Form – ${businessName}`,
        fields: {
          business_name: businessName,
          physical_address: physicalAddress,
          telephone_number: telephoneNumber,
          authorized_signatory_name: authorizedSignatoryName,
          crop_type: cropType,
          storage_quantity_kg: storageQuantityKg,
          bank_name: bankName,
          bank_branch: bankBranch,
          bank_account_number: bankAccount,
          depositor_signature: depositorFullName,   // full name as digital signature
          date: depositorDate,                       // must match backend required_fields key
          // Section 10 placeholders — filled by warehouse operator during review
          warehouse_operator_signature: '',
          warehouse_operator_name: ''
        },
      })
    },
    onSuccess: () => {
      toast({
        title: 'Form Submitted / Fomu Imetumwa',
        description: 'Pending staff review. You can track progress in My Documents.',
      })
      navigate('/depositor/documents')
    },
    onError: (err: Error) => {
      toast({ variant: 'destructive', title: 'Submission Failed', description: err.message })
    },
  })

  // ── Input class helper ───────────────────────────────────────────────────
  const inputCls = (name: FieldName) =>
    `border-gray-300 focus:border-amber-400 focus:ring-amber-300 transition-colors ${
      errors[name] ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : ''
    }`

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-orange-50">
      {/* ── Top bar ── */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-amber-100 px-4 py-3 flex items-center gap-3 shadow-sm">
        <Link to="/depositor/documents">
          <Button variant="ghost" size="sm" className="gap-1.5 text-amber-700 hover:bg-amber-50">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
        </Link>
        <div className="h-5 w-px bg-amber-200" />
        <ClipboardList className="w-4 h-4 text-amber-600" />
        <span className="font-semibold text-gray-800 text-sm">Depositors Registration Form</span>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

        {/* ── Official Header ── */}
        <div className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
          <div className="h-2 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500" />
          <div className="px-6 py-5">
            <div className="flex items-start justify-between mb-4">
              <div className="space-y-0.5">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">
                  Made under Section 3 of the Warehouse Receipt Act No 10 of 2005 and Schedule VI of the Warehouse Regulations 2016
                </p>
                <p className="text-[10px] text-amber-600 italic">
                  Chini ya Kifungu cha 3 Sheria Namba 10 ya 2005 Jedwali VI la Kanuni za Ghala 2016
                </p>
              </div>
              <div className="text-right shrink-0 ml-4">
                <p className="text-[10px] text-muted-foreground">FOMU / FORM</p>
                <p className="text-2xl font-black text-amber-600">NO 4</p>
              </div>
            </div>

            <div className="text-center py-4 border-y border-amber-100">
              <h1 className="text-xl font-black tracking-tight text-gray-900 uppercase">
                Depositors Registration Form
              </h1>
              <p className="text-sm font-semibold text-amber-700 italic mt-1">Form ya Mweka Mali</p>
              <p className="text-[11px] text-muted-foreground mt-3">
                Fill in Triplicate: 1st Copy – Depositor&nbsp;|&nbsp;2nd Copy – Warehouse Operator&nbsp;|&nbsp;3rd – Board
              </p>
              <p className="text-[11px] text-amber-600 italic">
                Jaza Nakala tatu: 1 Mweka Mali · 2 Mwendesha Ghala · 3 Bodi
              </p>
            </div>

            {/* Warehouse selector */}
            <div className="mt-5 p-4 rounded-xl bg-amber-50 border border-amber-200">
              <FormField
                label={
                  <span>
                    Warehouse / Ghala <span className="font-normal text-muted-foreground text-xs">– Select the warehouse for this deposit</span>
                  </span>
                }
                required
                error={warehouseError}
              >
                <Select onValueChange={(v) => setWarehouseId(Number(v))} disabled={warehousesQuery.isLoading}>
                  <SelectTrigger className={`bg-white ${warehouseError ? 'border-red-400' : 'border-amber-300'} focus:ring-amber-400`}>
                    <SelectValue placeholder={warehousesQuery.isLoading ? 'Loading warehouses…' : 'Select a warehouse / Chagua ghala'} />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.map(w => (
                      <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            </div>
          </div>
        </div>

        {/* ── Section A: Depositor Particulars ── */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 pt-5 pb-4">
            <SectionHeader en="Depositor Particulars" sw="Taarifa za Mweka Mali" icon={<User className="w-5 h-5" />} />
          </div>
          <div className="px-6 pb-6 space-y-5">

            {/* 1 – Business name */}
            <div className="flex gap-3 items-start">
              <span className="mt-2 inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-600 text-xs font-bold shrink-0">1</span>
              <div className="flex-1">
                <FormField
                  label={<>Full Business Name of Depositor <span className="font-normal text-amber-700 italic text-xs">/ Jina Kamili la Kibiashara la Mweka Mali</span></>}
                  required error={errors.businessName}
                >
                  <Input
                    value={businessName}
                    onChange={e => setBusinessName(e.target.value)}
                    onBlur={() => touch('businessName')}
                    placeholder="e.g. Kilimo Bora Ltd"
                    className={inputCls('businessName')}
                  />
                </FormField>
              </div>
            </div>

            {/* 2 – Physical address */}
            <div className="flex gap-3 items-start">
              <span className="mt-2 inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-600 text-xs font-bold shrink-0">2</span>
              <div className="flex-1">
                <FormField
                  label={<>Physical Address <span className="font-normal text-amber-700 italic text-xs">/ Anuani</span></>}
                  required error={errors.physicalAddress}
                >
                  <Textarea
                    value={physicalAddress}
                    onChange={e => setPhysicalAddress(e.target.value)}
                    onBlur={() => touch('physicalAddress')}
                    placeholder="Plot No., Street, Town, Region"
                    rows={2}
                    className={`resize-none ${inputCls('physicalAddress')}`}
                  />
                </FormField>
              </div>
            </div>

            {/* 3 – Phone */}
            <div className="flex gap-3 items-start">
              <span className="mt-2 inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-600 text-xs font-bold shrink-0">3</span>
              <div className="flex-1">
                <FormField
                  label={<>Telephone Number <span className="font-normal text-amber-700 italic text-xs">/ Namba ya Simu</span></>}
                  required error={errors.telephoneNumber}
                  hint="Tanzanian mobile: +255 7XX XXX XXX or 07XX XXX XXX"
                >
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      value={telephoneNumber}
                      onChange={e => setTelephoneNumber(e.target.value)}
                      onBlur={() => touch('telephoneNumber')}
                      placeholder="+255 712 345 678"
                      className={`pl-9 ${inputCls('telephoneNumber')}`}
                    />
                  </div>
                </FormField>
              </div>
            </div>

            {/* 4 – Authorized signatory */}
            <div className="flex gap-3 items-start">
              <span className="mt-2 inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-600 text-xs font-bold shrink-0">4</span>
              <div className="flex-1">
                <FormField
                  label={<>Full Name of Authorized Signatory <span className="font-normal text-amber-700 italic text-xs">/ Jina Kamili la Afisa Mwenye Mamlaka ya Kuweka Sahihi</span></>}
                  required error={errors.authorizedSignatoryName}
                >
                  <Input
                    value={authorizedSignatoryName}
                    onChange={e => setAuthorizedSignatoryName(e.target.value)}
                    onBlur={() => touch('authorizedSignatoryName')}
                    placeholder="Full legal name (letters only)"
                    className={inputCls('authorizedSignatoryName')}
                  />
                </FormField>
              </div>
            </div>
          </div>
        </div>

        {/* ── Section B: Commodity ── */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 pt-5 pb-4">
            <SectionHeader en="Commodity Information" sw="Taarifa za Mazao" icon={<Wheat className="w-5 h-5" />} />
          </div>
          <div className="px-6 pb-6 space-y-5">

            {/* 5 – Crop type */}
            <div className="flex gap-3 items-start">
              <span className="mt-2 inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-600 text-xs font-bold shrink-0">5</span>
              <div className="flex-1">
                <FormField
                  label={<>Type of Crop(s) <span className="font-normal text-amber-700 italic text-xs">/ Aina ya Zao</span></>}
                  required error={errors.cropType}
                >
                  <Select onValueChange={v => { setCropType(v); touch('cropType') }}>
                    <SelectTrigger className={errors.cropType ? 'border-red-400' : 'border-gray-300'}>
                      <SelectValue placeholder="Select crop type / Chagua aina ya zao" />
                    </SelectTrigger>
                    <SelectContent>
                      {CROP_TYPES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormField>
              </div>
            </div>

            {/* 6 – Storage quantity */}
            <div className="flex gap-3 items-start">
              <span className="mt-2 inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-600 text-xs font-bold shrink-0">6</span>
              <div className="flex-1">
                <FormField
                  label={<>Storage Quantity Estimate (kg) <span className="font-normal text-amber-700 italic text-xs">/ Kiasi Cha Mazao (Kwa Kilo) Ninachotarajia Kuleta Ghalani</span></>}
                  required error={errors.storageQuantityKg}
                  hint={!errors.storageQuantityKg ? 'Approximate weight in kilograms / Uzito wa takriban kwa kilo' : undefined}
                >
                  <Input
                    type="number"
                    min="1"
                    max="10000000"
                    step="1"
                    value={storageQuantityKg}
                    onChange={e => setStorageQuantityKg(e.target.value)}
                    onBlur={() => touch('storageQuantityKg')}
                    placeholder="e.g. 5000"
                    className={inputCls('storageQuantityKg')}
                  />
                </FormField>
              </div>
            </div>
          </div>
        </div>

        {/* ── Section C: Bank ── */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 pt-5 pb-4">
            <SectionHeader number={7} en="Bank Information" sw="Taarifa za Benki" icon={<CreditCard className="w-5 h-5" />} />
          </div>
          <div className="px-6 pb-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
            <FormField
              label={<>Name of Banker <span className="font-normal text-amber-700 italic text-xs">/ Jina la Benki</span></>}
              required error={errors.bankName}
            >
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={bankName}
                  onChange={e => setBankName(e.target.value)}
                  onBlur={() => touch('bankName')}
                  placeholder="e.g. CRDB Bank"
                  className={`pl-9 ${inputCls('bankName')}`}
                />
              </div>
            </FormField>

            <FormField
              label={<>Branch <span className="font-normal text-amber-700 italic text-xs">/ Tawi</span></>}
              required error={errors.bankBranch}
            >
              <Input
                value={bankBranch}
                onChange={e => setBankBranch(e.target.value)}
                onBlur={() => touch('bankBranch')}
                placeholder="e.g. Arusha Branch"
                className={inputCls('bankBranch')}
              />
            </FormField>

            <div className="sm:col-span-2">
              <FormField
                label={<>Bank Account Number <span className="font-normal text-amber-700 italic text-xs">/ Namba ya Akaunti</span></>}
                required error={errors.bankAccount}
                hint={!errors.bankAccount ? 'Letters, digits and hyphens only / Herufi, nambari na kistari tu' : undefined}
              >
                <Input
                  value={bankAccount}
                  onChange={e => setBankAccount(e.target.value)}
                  onBlur={() => touch('bankAccount')}
                  placeholder="e.g. 0150123456789"
                  className={inputCls('bankAccount')}
                />
              </FormField>
            </div>
          </div>
        </div>

        {/* ── Section D: Declaration ── */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 pt-5 pb-4">
            <SectionHeader number={8} en="Depositor's Declaration" sw="Azimio la Mweka Mali" />
          </div>
          <div className="px-6 pb-6 space-y-4">
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-gray-700 leading-relaxed space-y-3">
              <p>
                "Knowing that false statements made to the Board may lead to the rejection of this application and subjected to litigation.
                I declare that any statements made in this application are true to the best of my knowledge. Further, as a condition to granting
                this license, I have read and agree to comply with all provisions governing the operation of warehouse under this Act and its
                Regulations and other guidelines and directives issued by the Board."
              </p>
              <p className="text-amber-800 italic text-xs">
                "Najua kwamba taarifa yoyote ya uwongo itakayotolewa kwa Bodi ya Leseni za Maghala Tanzania nikiwa kama Mweka Mali itasababisha
                kukosa haki kwa mujibu wa Mwongozo, Kanuni na Sheria ya Stakabadhi za ghala. Pia ninajua kwamba, ninaweza kuchukuliwa hatua zaidi
                kwa mujibu wa Sheria hii, ikiwa ni pamoja na kufunguliwa Mashtaka Mahakamani. Kama sharti la kuhifadhiwa mazao yangu natamka
                kwamba nimekubaliana na nitafuata taratibu, miongozo, kanuni na sheria kwa mujibu wa Sheria ya Stakabadhi z Ghala ambazo kwa
                pamoja zinasimiwa na Bodi."
              </p>
            </div>

            <label className="flex items-start gap-3 cursor-pointer group">
              <div
                onClick={() => setDeclarationAgreed(v => !v)}
                className={`mt-0.5 w-5 h-5 shrink-0 rounded border-2 flex items-center justify-center transition-colors cursor-pointer ${
                  declarationAgreed ? 'bg-amber-500 border-amber-500' : 'border-gray-300 group-hover:border-amber-400'
                }`}
              >
                {declarationAgreed && <CheckCircle2 className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
              </div>
              <span className="text-sm text-gray-700 leading-snug select-none" onClick={() => setDeclarationAgreed(v => !v)}>
                I have read and agree to the declaration above.{' '}
                <span className="italic text-amber-700">/ Nimesoma na nakubaliana na azimio hilo hapo juu.</span>
              </span>
            </label>
            {submitAttempted.current && !declarationAgreed && (
              <p className="flex items-center gap-1 text-xs text-red-600 font-medium">
                <AlertCircle className="w-3 h-3 shrink-0" />
                You must accept the declaration to submit / Lazima ukubaliane na azimio
              </p>
            )}
          </div>
        </div>

        {/* ── Section E: Depositor Signature ── */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 pt-5 pb-4">
            <SectionHeader number={9} en="Depositor's Authorized Signature" sw="Saini ya Mweka Mali" />
          </div>
          <div className="px-6 pb-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="sm:col-span-2">
              <FormField
                label={<>Full Name <span className="font-normal text-amber-700 italic text-xs">/ Jina Kamili</span></>}
                required error={errors.depositorFullName}
              >
                <Input
                  value={depositorFullName}
                  onChange={e => setDepositorFullName(e.target.value)}
                  onBlur={() => touch('depositorFullName')}
                  placeholder="Full legal name of signatory"
                  className={inputCls('depositorFullName')}
                />
              </FormField>
            </div>

            <div className="sm:col-span-2">
              <FormField
                label="Signature / Sahihi"
                hint="Your digital submission serves as your binding signature / Utumaji wako wa kidijitali unafanya kazi kama sahihi"
              >
                <div className={`h-14 rounded-lg border-2 border-dashed bg-gray-50 flex items-center justify-center transition-colors ${depositorFullName ? 'border-amber-300 bg-amber-50' : 'border-gray-300'}`}>
                  <p className={`text-xs italic ${depositorFullName ? 'text-amber-700 font-medium' : 'text-muted-foreground'}`}>
                    {depositorFullName ? `– ${depositorFullName} –` : 'Signature will appear here / Sahihi itaonekana hapa'}
                  </p>
                </div>
              </FormField>
            </div>

            <div>
              <FormField
                label={<>Date <span className="font-normal text-amber-700 italic text-xs">/ Tarehe</span></>}
                required error={errors.depositorDate}
              >
                <Input
                  type="date"
                  value={depositorDate}
                  onChange={e => setDepositorDate(e.target.value)}
                  onBlur={() => touch('depositorDate')}
                  max={new Date().toISOString().split('T')[0]}
                  className={inputCls('depositorDate')}
                />
              </FormField>
            </div>
          </div>
        </div>

        {/* ── Section F: Warehouse Operator Signature (locked — operator fills on confirmation) ── */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden opacity-80">
          <div className="px-6 pt-5 pb-4">
            <SectionHeader
              number={10}
              en="Authorized Signatory of Warehouse Operator / Collateral Manager"
              sw="Saini ya Mwendesha Ghala / Msimamizi wa Dhamana"
              locked
            />
          </div>
          <div className="px-6 pb-6 space-y-4">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
              <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" />
              <p>
                This section is completed by the Warehouse Operator or Collateral Manager upon reviewing and confirming your submission. It will appear here on your document record once confirmed.
                <br />
                <span className="italic text-slate-500">Sehemu hii itajazwa na Mwendesha Ghala / Msimamizi wa Dhamana baada ya kupitia na kukubali maombi yako.</span>
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="sm:col-span-2">
                <FormField label={<>Full Name <span className="font-normal text-amber-700 italic text-xs">/ Jina Kamili</span></>}>
                  <LockedInput placeholder="Filled by Warehouse Operator / Itajazwa na Mwendesha Ghala" />
                </FormField>
              </div>

              <div className="sm:col-span-2">
                <FormField
                  label="Signature / Sahihi"
                  hint="Operator's countersignature will appear upon confirmation / Sahihi ya Mwendesha Ghala itaonekana baada ya kuthibitishwa"
                >
                  <div className="h-14 rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center">
                    <p className="text-xs text-gray-300 italic flex items-center gap-1.5">
                      <Lock className="w-3 h-3" />
                      Awaiting warehouse operator confirmation / Inasubiri uthibitisho wa Mwendesha Ghala
                    </p>
                  </div>
                </FormField>
              </div>

              <div>
                <FormField label={<>Date <span className="font-normal text-amber-700 italic text-xs">/ Tarehe</span></>}>
                  <LockedInput placeholder="Filled upon confirmation / Itajazwa baada ya uthibitisho" />
                </FormField>
              </div>
            </div>
          </div>
        </div>

        {/* ── Submit bar ── */}
        <div className="sticky bottom-4 z-10">
          <div className="bg-white/90 backdrop-blur rounded-2xl border border-amber-200 shadow-lg px-6 py-4 flex items-center justify-between gap-4">
            <div className="text-sm">
              {isFormValid ? (
                <span className="text-green-700 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Ready to submit / Tayari kutuma
                </span>
              ) : (
                <span className="text-amber-700">
                  {!declarationAgreed
                    ? 'Accept the declaration / Kubali azimio'
                    : hasErrors
                    ? 'Fix the errors above / Sahihisha makosa hapo juu'
                    : 'Fill all required fields / Jaza sehemu zote'}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => validationMutation.mutate()}
                disabled={validationMutation.isPending || !businessName.trim()}
                variant="secondary"
                className="gap-2"
              >
                {validationMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Validating…</>
                ) : (
                  <>📋 Validate Form</>
                )}
              </Button>
              <Button
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
                className="bg-amber-600 hover:bg-amber-700 text-white font-semibold px-6 gap-2 disabled:opacity-50"
              >
                {mutation.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Submitting…</>
                ) : (
                  'Submit Form / Tuma Fomu'
                )}
              </Button>
            </div>
          </div>
        </div>
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
