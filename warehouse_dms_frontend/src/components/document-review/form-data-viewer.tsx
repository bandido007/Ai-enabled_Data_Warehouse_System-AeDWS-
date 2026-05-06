import { ClipboardList } from 'lucide-react'

// Bilingual label map for Form No 4 fields
const FIELD_LABELS: Record<string, { en: string; sw: string; section?: string }> = {
  business_name:              { en: 'Full Business Name',                     sw: 'Jina Kamili la Kibiashara',                        section: 'Depositor Particulars' },
  physical_address:           { en: 'Physical Address',                       sw: 'Anuani',                                           section: 'Depositor Particulars' },
  telephone_number:           { en: 'Telephone Number',                       sw: 'Namba ya Simu',                                    section: 'Depositor Particulars' },
  authorized_signatory_name:  { en: 'Authorized Signatory',                   sw: 'Afisa Mwenye Mamlaka ya Kuweka Sahihi',            section: 'Depositor Particulars' },
  crop_type:                  { en: 'Type of Crop(s)',                        sw: 'Aina ya Zao',                                      section: 'Commodity' },
  storage_quantity_kg:        { en: 'Storage Quantity (kg)',                  sw: 'Kiasi cha Mazao (Kilo)',                           section: 'Commodity' },
  bank_name:                  { en: 'Bank Name',                              sw: 'Jina la Benki',                                    section: 'Bank' },
  bank_branch:                { en: 'Bank Branch',                            sw: 'Tawi la Benki',                                    section: 'Bank' },
  bank_account_number:        { en: 'Account Number',                        sw: 'Namba ya Akaunti',                                  section: 'Bank' },
  depositor_signature:        { en: "Depositor's Authorized Signature",      sw: 'Saini ya Mweka Mali',                               section: "Depositor's Signature" },
  date:                       { en: 'Date Signed',                           sw: 'Tarehe ya Kusaini',                                 section: "Depositor's Signature" },
  warehouse_operator_signature: { en: 'Warehouse Operator Signature',        sw: 'Saini ya Mwendesha Ghala',                         section: 'Warehouse Operator' },
  warehouse_operator_name:    { en: 'Warehouse Operator Full Name',          sw: 'Jina Kamili la Mwendesha Ghala',                   section: 'Warehouse Operator' },
}

// Group field keys by section in display order
const SECTION_ORDER = [
  'Depositor Particulars',
  'Commodity',
  'Bank',
  "Depositor's Signature",
  'Warehouse Operator',
]

interface FormDataViewerProps {
  fields: Record<string, string>
}

function FieldRow({ label, value }: { label: { en: string; sw: string }; value: string }) {
  const isEmpty = !value || value.trim() === ''
  return (
    <div className="py-2.5 border-b border-gray-100 last:border-0">
      <div className="flex flex-col sm:flex-row sm:items-start gap-0.5 sm:gap-4">
        <div className="sm:w-48 shrink-0">
          <p className="text-xs font-semibold text-gray-700">{label.en}</p>
          <p className="text-[10px] text-amber-700 italic">{label.sw}</p>
        </div>
        <p className={`flex-1 text-sm mt-0.5 sm:mt-0 ${isEmpty ? 'text-gray-300 italic' : 'text-gray-900 font-medium'}`}>
          {isEmpty ? '—' : value}
        </p>
      </div>
    </div>
  )
}

export function FormDataViewer({ fields }: FormDataViewerProps) {
  // Build section → fields map
  const sectionMap: Record<string, { key: string; label: { en: string; sw: string }; value: string }[]> = {}

  for (const [key, value] of Object.entries(fields)) {
    const meta = FIELD_LABELS[key]
    const section = meta?.section ?? 'Other'
    if (!sectionMap[section]) sectionMap[section] = []
    sectionMap[section].push({ key, label: meta ?? { en: key, sw: key }, value })
  }

  const sections = [
    ...SECTION_ORDER.filter(s => sectionMap[s]),
    ...Object.keys(sectionMap).filter(s => !SECTION_ORDER.includes(s)),
  ]

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-b from-amber-50/50 to-white p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 pb-3 border-b border-amber-200">
        <ClipboardList className="w-4 h-4 text-amber-600" />
        <div>
          <p className="text-sm font-bold text-gray-900">Depositors Registration Form</p>
          <p className="text-[10px] text-amber-700 italic">Form ya Mweka Mali — Form No 4</p>
        </div>
        <div className="ml-auto text-right shrink-0">
          <p className="text-[10px] text-muted-foreground">FOMU</p>
          <p className="text-lg font-black text-amber-600 leading-none">NO 4</p>
        </div>
      </div>

      {/* Sections */}
      {sections.map(section => (
        <div key={section} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2 bg-amber-50 border-b border-amber-100">
            <p className="text-xs font-bold text-amber-800 uppercase tracking-wide">{section}</p>
          </div>
          <div className="px-4 divide-y divide-gray-50">
            {sectionMap[section].map(({ key, label, value }) => (
              <FieldRow key={key} label={label} value={value} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
