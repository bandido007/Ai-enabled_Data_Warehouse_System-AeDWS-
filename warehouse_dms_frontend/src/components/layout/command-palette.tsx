import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Command } from 'cmdk'
import { Search } from 'lucide-react'

import { HighlightedText } from '@/components/search/highlighted-text'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { navigationItems } from '@/lib/permissions'
import { useDocumentSearchQuery } from '@/lib/queries'
import type { SearchMode } from '@/types/api'

export function CommandPalette({
  permissionSet,
  primaryRole,
}: {
  permissionSet: Set<string>
  primaryRole: string | null
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<SearchMode>('auto')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 200)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((current) => !current)
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) {
      setQuery('')
      setDebouncedQuery('')
      setMode('auto')
    }
  }

  const items = useMemo(
    () =>
      navigationItems.filter((item) => {
        const roleMatch = !item.roles?.length || (primaryRole ? item.roles.includes(primaryRole as never) : false)
        const permissionMatch =
          !item.permissions?.length || item.permissions.some((permission) => permissionSet.has(permission))

        return roleMatch && permissionMatch
      }),
    [permissionSet, primaryRole]
  )

  const searchPath = primaryRole === 'REGULATOR' ? '/regulator/search' : '/search'
  const documentPath = (id: number) =>
    primaryRole === 'REGULATOR' ? `/regulator/documents/${id}` : `/documents/${id}`
  const searchQuery = useDocumentSearchQuery(debouncedQuery, mode, open)
  const searchResults = searchQuery.data?.results ?? []

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 flex-1 items-center gap-2 rounded-sm border border-border bg-canvas px-3 text-left text-sm text-text-tertiary transition-standard hover:border-text-tertiary"
      >
        <Search className="h-4 w-4" />
        <span>{t('commandPalette.placeholder')}</span>
        <span className="ml-auto rounded-[3px] border border-border bg-surface px-1.5 py-0.5 font-mono text-[11px]">⌘K</span>
      </button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-xl p-0">
          <Command className="overflow-hidden rounded-md bg-surface">
            <div className="flex items-center border-b border-border px-3">
              <Search className="mr-2 h-4 w-4 text-text-tertiary" />
              <Command.Input
                className="flex h-11 w-full bg-transparent text-sm outline-none placeholder:text-text-tertiary"
                placeholder={t('commandPalette.placeholder')}
                value={query}
                onValueChange={setQuery}
              />
            </div>
            <div className="flex gap-2 border-b border-border px-3 py-2">
              {(['auto', 'keyword', 'semantic'] as SearchMode[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMode(option)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-standard ${
                    mode === option ? 'bg-brand-teal text-surface' : 'bg-canvas text-text-secondary'
                  }`}
                >
                  {t(`commandPalette.modes.${option}`)}
                </button>
              ))}
            </div>
            <Command.List className="max-h-80 overflow-y-auto p-2 scrollbar-thin">
              <Command.Empty className="px-2 py-6 text-center text-sm text-text-secondary">
                {t('commandPalette.empty')}
              </Command.Empty>
              {debouncedQuery.length >= 2 ? (
                <>
                  <Command.Group heading={t('commandPalette.searchResults')}>
                    {searchResults.map((result) => (
                      <Command.Item
                        key={`result-${result.id}`}
                        value={`${result.title} ${result.snippet} ${result.documentTypeId} ${result.warehouseName}`}
                        onSelect={() => {
                          navigate(documentPath(result.id))
                          setOpen(false)
                        }}
                        className="cursor-pointer rounded-sm px-3 py-2 data-[selected=true]:bg-canvas"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-3">
                            <span className="line-clamp-1 text-sm font-medium text-text-primary">
                              <HighlightedText text={result.title} query={debouncedQuery} />
                            </span>
                            <span className="font-mono text-[11px] uppercase tracking-[0.05em] text-text-tertiary">
                              {result.score == null ? '—' : `${Math.round(result.score * 100)}%`}
                            </span>
                          </div>
                          <div className="line-clamp-2 text-xs text-text-secondary">
                            <HighlightedText text={result.snippet || '—'} query={debouncedQuery} />
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.05em] text-text-tertiary">
                            <span>{result.documentTypeId}</span>
                            {result.warehouseName ? <span>• {result.warehouseName}</span> : null}
                            <span>• {result.status}</span>
                          </div>
                        </div>
                      </Command.Item>
                    ))}
                    <Command.Item
                      value={`${debouncedQuery} full search`}
                      onSelect={() => {
                        navigate(`${searchPath}?q=${encodeURIComponent(debouncedQuery)}&mode=${mode}`)
                        setOpen(false)
                      }}
                      className="flex cursor-pointer items-center rounded-sm px-3 py-2 text-sm text-brand-teal data-[selected=true]:bg-canvas"
                    >
                      {t('commandPalette.openFullSearch')}
                    </Command.Item>
                  </Command.Group>
                </>
              ) : null}
              <Command.Group heading={t('commandPalette.quickActions')}>
                {items.map((item) => (
                  <Command.Item
                    key={item.key}
                    onSelect={() => {
                      navigate(primaryRole === 'REGULATOR' && item.to === '/search' ? '/regulator/search' : item.to)
                      setOpen(false)
                    }}
                    className="flex cursor-pointer items-center rounded-sm px-3 py-2 text-sm text-text-primary data-[selected=true]:bg-canvas"
                  >
                    {t(item.labelKey)}
                  </Command.Item>
                ))}
              </Command.Group>
            </Command.List>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  )
}
