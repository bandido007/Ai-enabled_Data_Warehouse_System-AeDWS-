/**
 * CEO Issuances Page
 *
 * Allows the CEO to:
 *  • See all documents they have issued, organised by recipient type
 *  • Upload a new issuance directed at a specific recipient
 *    (Depositor / Staff / Management / Regulatory Body)
 *
 * Document routing is handled by document type:
 *   ceo_notice_to_depositor   → DEPOSITOR can view
 *   ceo_directive_to_staff    → STAFF + MANAGER can view
 *   ceo_directive_to_manager  → MANAGER can view
 *   ceo_submission_to_regulator → REGULATOR can view
 *
 * All CEO-issued documents start in APPROVED state (no further review
 * chain required).
 */

import { ArrowRight, Building2, FileCheck2, FileUp, Users, Landmark, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { PageHeader } from '@/components/common/page-header'
import { StatusBadge } from '@/components/common/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatShortDate } from '@/lib/utils'
import { useDocumentsQuery } from '@/lib/queries'

// ── Recipient config ───────────────────────────────────────────────────────

interface RecipientConfig {
  docTypeId: string
  label: string
  labelSw: string
  description: string
  icon: React.ReactNode
  color: string        // Tailwind accent colour for the card border / icon
  badgeLabel: string
}

const RECIPIENTS: RecipientConfig[] = [
  {
    docTypeId: 'ceo_notice_to_depositor',
    label: 'Notice / Certificate to Depositor',
    labelSw: 'Taarifa / Cheti kwa Mweka Amana',
    description: 'Issue certificates, notices, or instructions that a Depositor can view and download from their portal.',
    icon: <Building2 className="h-6 w-6" />,
    color: 'text-blue-600 border-blue-200 bg-blue-50',
    badgeLabel: 'Depositor',
  },
  {
    docTypeId: 'ceo_directive_to_staff',
    label: 'Directive / Circular to Staff',
    labelSw: 'Waraka / Mzunguko kwa Wafanyakazi',
    description: 'Internal policy circulars, memos, or directives visible to all Staff and Managers.',
    icon: <Users className="h-6 w-6" />,
    color: 'text-green-600 border-green-200 bg-green-50',
    badgeLabel: 'Staff',
  },
  {
    docTypeId: 'ceo_directive_to_manager',
    label: 'Directive to Management',
    labelSw: 'Waraka kwa Wasimamizi',
    description: 'Confidential instructions or policy changes addressed to Managers only.',
    icon: <ShieldCheck className="h-6 w-6" />,
    color: 'text-purple-600 border-purple-200 bg-purple-50',
    badgeLabel: 'Management',
  },
  {
    docTypeId: 'ceo_submission_to_regulator',
    label: 'Submission to Regulatory Body',
    labelSw: 'Uwasilishaji kwa Mamlaka ya Udhibiti',
    description: 'Reports, filings, or documents sent to WRRB or other regulatory authorities.',
    icon: <Landmark className="h-6 w-6" />,
    color: 'text-orange-600 border-orange-200 bg-orange-50',
    badgeLabel: 'Regulator',
  },
]

function recipientForTypeId(typeId: string): RecipientConfig | undefined {
  return RECIPIENTS.find((r) => r.docTypeId === typeId)
}

// ── Recipient badge ────────────────────────────────────────────────────────

function RecipientBadge({ typeId }: { typeId: string }) {
  const r = recipientForTypeId(typeId)
  if (!r) return null
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${r.color}`}>
      {r.icon && <span className="h-3 w-3 [&>svg]:h-3 [&>svg]:w-3">{r.icon}</span>}
      {r.badgeLabel}
    </span>
  )
}

// ── Recipient action cards ─────────────────────────────────────────────────

function RecipientCards() {
  const navigate = useNavigate()
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {RECIPIENTS.map((r) => (
        <Card
          key={r.docTypeId}
          className={`cursor-pointer border transition-shadow hover:shadow-md ${r.color}`}
          onClick={() => navigate(`/documents/upload?category=CEO_ISSUANCE&type=${r.docTypeId}`)}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className={r.color.split(' ')[0]}>{r.icon}</span>
              <Badge variant="neutral" className="text-[10px]">
                {r.badgeLabel}
              </Badge>
            </div>
            <CardTitle className="mt-2 text-sm leading-snug">{r.label}</CardTitle>
            <p className="text-[10px] italic text-muted-foreground">{r.labelSw}</p>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground leading-relaxed">{r.description}</p>
            <div className="mt-3 flex items-center gap-1 text-xs font-medium">
              <FileUp className="h-3 w-3" />
              Upload document
              <ArrowRight className="ml-auto h-3 w-3" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ── Issuances table ────────────────────────────────────────────────────────

function IssuancesTable() {
  const navigate = useNavigate()
  const [selectedType, setSelectedType] = useState<string>('all')

  const params = useMemo(() => ({
    itemsPerPage: 50,
    pageNumber: 1,
    documentCategory: 'CEO_ISSUANCE',
    documentTypeId: selectedType !== 'all' ? selectedType : undefined,
  }), [selectedType])

  const docsQuery = useDocumentsQuery(params, true)
  const docs = docsQuery.data?.data ?? []

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between border-b px-5 py-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileCheck2 className="h-4 w-4 text-muted-foreground" />
          Issued Documents
        </CardTitle>
        {/* Recipient filter */}
        <div className="flex items-center gap-2">
          {(['all', ...RECIPIENTS.map((r) => r.docTypeId)] as string[]).map((id) => {
            const r = id === 'all' ? null : recipientForTypeId(id)
            return (
              <button
                key={id}
                onClick={() => setSelectedType(id)}
                className={`rounded-full px-3 py-0.5 text-xs font-medium transition-colors ${
                  selectedType === id
                    ? 'bg-foreground text-background'
                    : 'bg-muted text-muted-foreground hover:bg-muted/70'
                }`}
              >
                {r ? r.badgeLabel : 'All'}
              </button>
            )
          })}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {docsQuery.isLoading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 rounded" />
            ))}
          </div>
        ) : docs.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-sm text-muted-foreground">
            <FileCheck2 className="h-8 w-8 opacity-30" />
            <p>No issuances found. Use the cards above to upload your first one.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2.5 pl-5 pr-3 text-left">Title</th>
                  <th className="py-2.5 pr-3 text-left">Recipient</th>
                  <th className="py-2.5 pr-3 text-left">Status</th>
                  <th className="py-2.5 pr-3 text-left">Warehouse</th>
                  <th className="py-2.5 pr-5 text-right">Date</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((doc) => (
                  <tr
                    key={doc.id}
                    className="cursor-pointer border-b last:border-0 text-sm hover:bg-muted/40 transition-colors"
                    onClick={() => navigate(`/documents/${doc.id}`)}
                  >
                    <td className="py-3 pl-5 pr-3 font-medium max-w-[260px] truncate">{doc.title}</td>
                    <td className="py-3 pr-3">
                      <RecipientBadge typeId={doc.documentTypeId} />
                    </td>
                    <td className="py-3 pr-3">
                      <StatusBadge status={doc.status} />
                    </td>
                    <td className="py-3 pr-3 text-xs text-muted-foreground">{doc.warehouseName ?? '—'}</td>
                    <td className="py-3 pr-5 text-right text-xs text-muted-foreground">
                      {formatShortDate(doc.createdDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export function CeoIssuancesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="CEO Issuances"
        subtitle="Upload and manage documents issued by the CEO. Select a recipient type below to route the document to the correct audience."
        actions={
          <Button variant="secondary" asChild>
            <a href="/documents">View all documents</a>
          </Button>
        }
      />

      <RecipientCards />
      <IssuancesTable />
    </div>
  )
}
