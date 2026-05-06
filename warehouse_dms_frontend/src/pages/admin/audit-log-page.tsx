import { useQuery } from '@tanstack/react-query'
import { Activity, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock, FileText, Search } from 'lucide-react'
import { useMemo, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { getList } from '@/lib/api'

interface AuditEntry {
  id: number | string
  documentId?: number | string
  documentName?: string
  action?: string
  actionType?: string
  performedBy?: string
  performedAt?: string
  createdAt?: string
  note?: string
  details?: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }

  return null
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : undefined
}

function asId(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? value : undefined
}

const ACTION_COLOR: Record<string, { bg: string; text: string }> = {
  APPROVED:  { bg: 'var(--success-bg)', text: 'var(--success)' },
  REJECTED:  { bg: 'var(--error-bg)', text: 'var(--error)' },
  SUBMITTED: { bg: 'var(--info-bg)', text: 'var(--info)' },
  REVIEWED:  { bg: 'rgba(168,85,247,0.12)',   text: '#c084fc' },
  UPLOADED:  { bg: 'rgba(26,115,232,0.10)', text: '#1a73e8' },
  FLAGGED:   { bg: 'var(--warning-bg)', text: 'var(--warning)' },
}

function getActionStyle(action?: string) {
  const key = (action ?? '').toUpperCase()
  return ACTION_COLOR[key] ?? { bg: 'var(--admin-panel-subtle-bg)', text: 'var(--text-secondary)' }
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false)
  const action = entry.action ?? entry.actionType ?? '—'
  const style  = getActionStyle(action)
  const when   = entry.performedAt ?? entry.createdAt
  const detail = entry.note ?? entry.details

  return (
    <div style={{ borderBottom: '1px solid var(--admin-row-border)' }}>
      <div
        className="flex cursor-pointer items-center gap-4 px-4 py-3 text-sm transition-colors"
        style={{ background: 'transparent' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--admin-hover-bg)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        onClick={() => detail && setOpen((p) => !p)}
      >
        {/* Doc name */}
        <div className="flex flex-1 items-center gap-2 min-w-0">
          <FileText className="h-4 w-4 shrink-0 text-text-tertiary" />
          {entry.documentId ? (
            <Link
              to={`/documents/${entry.documentId}`}
              className="truncate font-medium text-text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {entry.documentName ?? `Document #${entry.documentId}`}
            </Link>
          ) : (
            <span className="truncate font-medium text-text-primary">{entry.documentName ?? '—'}</span>
          )}
        </div>

        {/* Action */}
        <span className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ background: style.bg, color: style.text }}>
          {action}
        </span>

        {/* Who */}
        <span className="w-36 shrink-0 truncate text-xs text-text-secondary">{entry.performedBy ?? '—'}</span>

        {/* When */}
        <span className="w-32 shrink-0 text-xs text-text-tertiary">
          {when ? new Date(when).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Africa/Nairobi' }) : '—'}
        </span>

        {/* Expand */}
        {detail && (
          <span className="text-text-tertiary">
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </span>
        )}
      </div>

      {open && detail && (
        <div className="px-6 pb-3 pt-0">
          <div
            className="rounded-lg px-3 py-2 text-xs text-text-secondary"
            style={{ background: 'var(--admin-panel-subtle-bg)', border: '1px solid var(--admin-panel-border)' }}
          >
            {detail}
          </div>
        </div>
      )}
    </div>
  )
}

const PAGE_SIZE = 10

export function AuditLogPage() {
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [page, setPage] = useState(1)

  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['audit-log'],
    queryFn: () =>
      getList<Record<string, unknown>>('/documents/').then((r) =>
        (r.data ?? []).map((d): AuditEntry => {
          const documentId = asId(d.id) ?? `document-${Math.random().toString(36).slice(2)}`
          const uploadedBy = asRecord(d.uploadedBy)
          const createdBy = asRecord(d.createdBy)

          return {
            id: documentId,
            documentId,
            documentName: asString(d.title) ?? `Document #${documentId}`,
            action: asString(d.status) ?? 'UPLOADED',
            performedBy: asString(uploadedBy?.username) ?? asString(createdBy?.username) ?? '—',
            performedAt: asString(d.updatedAt) ?? asString(d.createdAt),
            note: asString(d.currentCorrectionNote),
          }
        })
      ),
    refetchInterval: 30_000,
  })

  const filtered = useMemo(
    () => entries.filter((e) => {
      const text = `${e.documentName ?? ''} ${e.action ?? ''} ${e.performedBy ?? ''}`.toLowerCase()
      const matchSearch = !search || text.includes(search.toLowerCase())
      const matchAction = !actionFilter || (e.action ?? e.actionType ?? '').toUpperCase() === actionFilter
      return matchSearch && matchAction
    }),
    [entries, search, actionFilter],
  )

  useEffect(() => { setPage(1) }, [search, actionFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const actions = useMemo(() => {
    const set = new Set<string>()
    entries.forEach((e) => { if (e.action ?? e.actionType) set.add((e.action ?? e.actionType ?? '').toUpperCase()) })
    return Array.from(set).sort()
  }, [entries])

  return (
    <div className="flex flex-col gap-5 pb-6">
      <div className="flex shrink-0 items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Audit Log</h1>
          <p className="mt-0.5 text-sm text-text-tertiary">Complete record of document actions</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs" style={{ background: 'var(--info-bg)', border: '1px solid var(--admin-panel-border)', color: 'var(--info)' }}>
          <Clock className="h-3.5 w-3.5" />
          <span className="font-mono">{now.toLocaleTimeString('en-GB', { timeZone: 'Africa/Nairobi', hour12: false })}</span>
          <span className="mx-1 text-text-tertiary">·</span>
          <span>{now.toLocaleDateString('en-GB', { dateStyle: 'medium', timeZone: 'Africa/Nairobi' })} EAT</span>
        </div>
      </div>

      {/* Stat */}
      <div className="flex shrink-0 items-center gap-4 rounded-xl p-5 w-fit" style={{ background: 'var(--admin-panel-bg)', border: '1px solid var(--admin-panel-border)', boxShadow: 'var(--shadow-sm)' }}>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'var(--admin-avatar-bg)' }}>
          <Activity className="h-5 w-5" style={{ color: 'var(--admin-avatar-text)' }} />
        </div>
        <div>
          <div className="text-2xl font-bold text-text-primary">{entries.length}</div>
          <div className="text-xs text-text-tertiary">Total Audit Events</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-3 rounded-xl px-4 py-3" style={{ background: 'var(--admin-panel-subtle-bg)', border: '1px solid var(--admin-panel-border)', boxShadow: 'var(--shadow-sm)' }}>
        <Search className="h-4 w-4 shrink-0 text-text-tertiary" />
        <Input
          placeholder="Search audit log…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 flex-1 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
        />
        {actions.length > 0 && (
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="rounded-lg px-3 py-1.5 text-xs outline-none"
            style={{ background: 'var(--admin-button-bg)', border: '1px solid var(--admin-panel-border)', color: 'var(--text-secondary)' }}
          >
            <option value="">All actions</option>
            {actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
      </div>

      {/* Log */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl" style={{ background: 'var(--admin-panel-bg)', border: '1px solid var(--admin-panel-border)', boxShadow: 'var(--shadow-sm)' }}>
        {/* Header */}
        <div
          className="grid px-4 py-2.5 text-[11px] font-semibold uppercase tracking-widest"
          style={{ gridTemplateColumns: '1fr auto auto auto auto', gap: '1rem', color: 'var(--text-tertiary)', borderBottom: '1px solid var(--admin-row-border)', background: 'var(--admin-panel-subtle-bg)' }}
        >
          <span>Document</span>
          <span>Action</span>
          <span className="w-36">Performed By</span>
          <span className="w-32">Date</span>
          <span className="w-4" />
        </div>

        <div className="flex-1 overflow-y-auto" style={{ background: 'var(--admin-panel-bg)' }}>
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3" style={{ borderBottom: '1px solid var(--admin-row-border)' }}>
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))
            : paged.map((e) => <AuditRow key={e.id} entry={e} />)}

          {!isLoading && filtered.length === 0 && (
            <div className="py-16 text-center text-sm text-text-tertiary">No audit entries found</div>
          )}
        </div>
      </div>

      {/* Pagination */}
      {!isLoading && totalPages > 1 && (
        <div className="flex shrink-0 items-center justify-between rounded-xl px-4 py-3" style={{ background: 'var(--admin-panel-bg)', border: '1px solid var(--admin-panel-border)', boxShadow: 'var(--shadow-sm)' }}>
          <span className="text-xs text-text-tertiary">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} entries
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors disabled:opacity-30"
              style={{ background: 'var(--admin-button-bg)' }}
            >
              <ChevronLeft className="h-4 w-4 text-text-secondary" />
            </button>
            {Array.from({ length: totalPages }).map((_, idx) => (
              <button
                key={idx}
                onClick={() => setPage(idx + 1)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold transition-colors"
                style={{
                  background: page === idx + 1 ? 'var(--admin-page-active-bg)' : 'var(--admin-button-bg)',
                  color: page === idx + 1 ? 'var(--admin-page-active-text)' : 'var(--text-secondary)',
                }}
              >
                {idx + 1}
              </button>
            ))}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors disabled:opacity-30"
              style={{ background: 'var(--admin-button-bg)' }}
            >
              <ChevronRight className="h-4 w-4 text-text-secondary" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
