import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowUpDown, FileText, Search, Upload } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { DepositorDocumentCard } from '@/components/depositor/document-card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useDocumentsQuery } from '@/lib/queries'
import { cn } from '@/lib/utils'
import type { DocumentRecord } from '@/types/api'

type FilterKey = 'all' | 'pending' | 'correction' | 'approved'
type SortKey = 'newest' | 'oldest' | 'title' | 'status'

const FILTERS: { key: FilterKey; label: string; match: (d: DocumentRecord) => boolean }[] = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'pending', label: 'In review', match: (d) => ['PENDING_STAFF', 'PENDING_MANAGER', 'PENDING_CEO'].includes(d.status) },
  { key: 'correction', label: 'Correction', match: (d) => d.status === 'CORRECTION_NEEDED' },
  { key: 'approved', label: 'Approved', match: (d) => d.status === 'APPROVED' },
]

function sortDocuments(documents: DocumentRecord[], sortKey: SortKey) {
  return [...documents].sort((left, right) => {
    if (sortKey === 'oldest') return new Date(left.createdDate).getTime() - new Date(right.createdDate).getTime()
    if (sortKey === 'title') return left.title.localeCompare(right.title)
    if (sortKey === 'status') return left.status.localeCompare(right.status)
    return new Date(right.createdDate).getTime() - new Date(left.createdDate).getTime()
  })
}

export function DepositorDocumentsPage() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const documentsQuery = useDocumentsQuery({ itemsPerPage: 50 }, true)
  const allDocs = documentsQuery.data?.data ?? []
  const urlFilter = (searchParams.get('filter') as FilterKey) || 'all'
  const urlQuery = searchParams.get('q') ?? ''
  const urlSort = (searchParams.get('sort') as SortKey) || 'newest'
  const [draftSearch, setDraftSearch] = useState(urlQuery)

  useEffect(() => {
    setDraftSearch(urlQuery)
  }, [urlQuery])

  const filtered = useMemo(() => {
    const matcher = FILTERS.find((f) => f.key === urlFilter)?.match ?? FILTERS[0].match
    const searched = allDocs.filter((doc) => {
      const q = urlQuery.trim().toLowerCase()
      if (!q) return true
      return [doc.title, doc.documentTypeId, doc.warehouseName, doc.status].join(' ').toLowerCase().includes(q)
    })
    return sortDocuments(searched.filter(matcher), urlSort)
  }, [allDocs, urlFilter, urlQuery, urlSort])

  const correctionDocs = filtered.filter((doc) => doc.status === 'CORRECTION_NEEDED')

  function updateParams(next: Partial<Record<'filter' | 'q' | 'sort', string>>) {
    const params = new URLSearchParams(searchParams)
    Object.entries(next).forEach(([key, value]) => {
      if (!value || value === 'all' || (key === 'sort' && value === 'newest')) params.delete(key)
      else params.set(key, value)
    })
    setSearchParams(params)
  }

  return (
    <div className="space-y-5">
      <div className="space-y-0.5">
        <Link to="/depositor" className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--brand-teal)' }}>
          ← Back
        </Link>
        <h1 className="text-xl font-bold text-text-primary">{t('depositorDocuments.title')}</h1>
        <p className="text-sm text-text-secondary">Search, sort, and act on your documents faster.</p>
      </div>

      <div className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <form onSubmit={(event) => { event.preventDefault(); updateParams({ q: draftSearch }) }} className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <Input value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} className="pl-10" placeholder="Search by title, type, warehouse, or status" />
        </form>

        <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin">
          {FILTERS.map((f) => {
            const count = allDocs.filter(f.match).length
            const isActive = urlFilter === f.key
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => updateParams({ filter: f.key })}
                className={cn('inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors', isActive ? 'text-brand-teal' : 'text-text-secondary')}
                style={{ borderColor: isActive ? 'var(--brand-teal)' : 'var(--border)', background: isActive ? 'var(--info-bg)' : 'var(--surface)' }}
              >
                <span>{f.label}</span>
                <span className="rounded-full px-1.5 py-0.5 text-[10px]" style={{ background: isActive ? 'rgba(26,115,232,0.15)' : 'var(--border-subtle)' }}>{count}</span>
              </button>
            )
          })}
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-text-tertiary">
            Showing <span className="font-semibold text-text-primary">{filtered.length}</span> result{filtered.length === 1 ? '' : 's'}
          </div>
          <label className="flex items-center gap-2 text-xs text-text-tertiary">
            <ArrowUpDown className="h-3.5 w-3.5" />
            <select value={urlSort} onChange={(event) => updateParams({ sort: event.target.value })} className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-text-primary outline-none">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="title">Title A-Z</option>
              <option value="status">Status</option>
            </select>
          </label>
        </div>
      </div>

      {!documentsQuery.isLoading && correctionDocs.length > 0 && urlFilter !== 'approved' && (
        <div className="rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--error)', background: 'var(--error-bg)' }}>
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--error)' }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--error)' }}>Documents needing your attention</p>
              <p className="mt-0.5 text-xs" style={{ color: 'var(--error)' }}>
                {correctionDocs.length} document{correctionDocs.length === 1 ? '' : 's'} need correction before they can continue.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {documentsQuery.isLoading ? (
          Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-[72px] rounded-2xl" />)
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: 'var(--info-bg)' }}>
              <FileText className="h-7 w-7" style={{ color: 'var(--brand-teal)' }} />
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary">No documents found</p>
              <p className="mt-0.5 text-xs text-text-tertiary">
                {urlQuery ? 'Try a different search or filter.' : urlFilter === 'all' ? 'Start by uploading your first document.' : `No documents with "${FILTERS.find((f) => f.key === urlFilter)?.label}" status.`}
              </p>
            </div>
            <Link to="/depositor/upload" className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold text-white" style={{ background: 'var(--brand-teal)' }}>
              <Upload className="h-3.5 w-3.5" />
              Upload document
            </Link>
          </div>
        ) : (
          filtered.map((document) => <DepositorDocumentCard key={document.id} document={document} />)
        )}
      </div>
    </div>
  )
}
