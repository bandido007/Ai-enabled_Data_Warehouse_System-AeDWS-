import { useEffect, useMemo, useState } from 'react'
import { Search, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { EmptyState } from '@/components/common/empty-state'
import { PageHeader } from '@/components/common/page-header'
import { HighlightedText } from '@/components/search/highlighted-text'
import { StatusBadge } from '@/components/common/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useDocumentSearchQuery } from '@/lib/queries'
import { cn } from '@/lib/utils'
import type { SearchHit, SearchMode } from '@/types/api'

const searchModes: SearchMode[] = ['auto', 'keyword', 'semantic']

function getScorePercent(score?: number | null) {
  if (score == null) {
    return null
  }

  return Math.max(0, Math.min(100, Math.round(score * 100)))
}

export function DocumentSearchPage({ regulator = false }: { regulator?: boolean }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '')
  const [mode, setMode] = useState<SearchMode>(() => {
    const value = searchParams.get('mode')
    return value === 'keyword' || value === 'semantic' || value === 'auto' ? value : 'auto'
  })
  const [debouncedQuery, setDebouncedQuery] = useState(query)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const next = new URLSearchParams()
    if (query.trim()) {
      next.set('q', query.trim())
    }
    if (mode !== 'auto') {
      next.set('mode', mode)
    }
    setSearchParams(next, { replace: true })
  }, [mode, query, setSearchParams])

  const resultsQuery = useDocumentSearchQuery(debouncedQuery, mode, debouncedQuery.length >= 2)
  const payload = resultsQuery.data
  const results = payload?.results ?? []
  const resolvedMode = payload?.mode ?? mode
  const detected = payload?.detected ?? false

  const targetPath = useMemo(
    () => (id: number) => (regulator ? `/regulator/documents/${id}` : `/documents/${id}`),
    [regulator]
  )

  return (
    <div className="space-y-6">
      <PageHeader title={t('searchPage.title')} subtitle={t('searchPage.subtitle')} />

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('searchPage.placeholder')}
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {searchModes.map((option) => (
                <Button
                  key={option}
                  type="button"
                  size="sm"
                  variant={mode === option ? 'primary' : 'secondary'}
                  onClick={() => setMode(option)}
                >
                  {t(`searchPage.modes.${option}`)}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm text-text-secondary">
            <span>{t('searchPage.scope')}</span>
            {detected ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-teal/10 px-2.5 py-1 text-xs font-medium text-brand-teal">
                <Sparkles className="h-3.5 w-3.5" />
                {t('searchPage.detected', { mode: t(`searchPage.modes.${resolvedMode}`) })}
              </span>
            ) : null}
            {debouncedQuery.length >= 2 && !resultsQuery.isLoading ? (
              <span className="font-mono text-xs uppercase tracking-[0.05em] text-text-tertiary">
                {t('searchPage.count', { count: results.length })}
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {debouncedQuery.length < 2 ? (
        <EmptyState
          icon={<Search className="h-6 w-6" />}
          title={t('searchPage.initial.title')}
          description={t('searchPage.initial.description')}
        />
      ) : resultsQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-36 rounded-md" />
          ))}
        </div>
      ) : results.length ? (
        <div className="space-y-4">
          {results.map((result) => {
            const scorePercent = getScorePercent(result.score)
            return (
              <button
                key={result.id}
                type="button"
                onClick={() => navigate(targetPath(result.id))}
                className="w-full rounded-md border border-border bg-surface p-5 text-left shadow-sm transition-standard hover:border-text-tertiary"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={result.status} />
                      <span className="rounded-full bg-canvas px-2.5 py-1 text-xs font-medium text-text-secondary">
                        {result.documentTypeId}
                      </span>
                      {result.warehouseName ? (
                        <span className="rounded-full bg-border-subtle px-2.5 py-1 text-xs font-medium text-text-secondary">
                          {result.warehouseName}
                        </span>
                      ) : null}
                    </div>
                    <div className="text-lg font-semibold text-text-primary">
                      <HighlightedText text={result.title} query={debouncedQuery} />
                    </div>
                    <p className="line-clamp-3 text-sm leading-6 text-text-secondary">
                      <HighlightedText text={result.snippet || t('searchPage.noSnippet')} query={debouncedQuery} />
                    </p>
                  </div>
                  <div className="w-full max-w-[220px] space-y-2 lg:w-[220px]">
                    <div className="flex items-center justify-between text-xs font-mono uppercase tracking-[0.05em] text-text-tertiary">
                      <span>{t('searchPage.relevance')}</span>
                      <span>{scorePercent == null ? '—' : `${scorePercent}%`}</span>
                    </div>
                    <div className="h-2 rounded-full bg-border-subtle">
                      <div
                        className={cn(
                          'h-2 rounded-full',
                          resolvedMode === 'semantic' ? 'bg-brand-terracotta' : 'bg-brand-teal'
                        )}
                        style={{ width: `${scorePercent ?? 0}%` }}
                      />
                    </div>
                    <div className="text-xs text-text-tertiary">{t(`searchPage.modes.${resolvedMode}`)}</div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        <EmptyState
          icon={<Search className="h-6 w-6" />}
          title={t('searchPage.empty.title')}
          description={t('searchPage.empty.description', { query: debouncedQuery })}
        />
      )}
    </div>
  )
}

export function SearchResultsList({
  results,
  query,
  onSelect,
}: {
  results: SearchHit[]
  query: string
  onSelect: (id: number) => void
}) {
  const { t } = useTranslation()

  if (!results.length) {
    return <div className="px-2 py-6 text-center text-sm text-text-secondary">{t('commandPalette.noResults')}</div>
  }

  return (
    <div className="space-y-1">
      {results.map((result) => {
        const scorePercent = getScorePercent(result.score)
        return (
          <button
            key={result.id}
            type="button"
            onClick={() => onSelect(result.id)}
            className="flex w-full flex-col gap-1 rounded-sm px-3 py-2 text-left transition-standard hover:bg-canvas"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="line-clamp-1 text-sm font-medium text-text-primary">
                <HighlightedText text={result.title} query={query} />
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[0.05em] text-text-tertiary">
                {scorePercent == null ? '—' : `${scorePercent}%`}
              </span>
            </div>
            <div className="line-clamp-2 text-xs text-text-secondary">
              <HighlightedText text={result.snippet || t('searchPage.noSnippet')} query={query} />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.05em] text-text-tertiary">
              <span>{result.documentTypeId}</span>
              {result.warehouseName ? <span>• {result.warehouseName}</span> : null}
              <span>• {result.status}</span>
            </div>
          </button>
        )
      })}
    </div>
  )
}
