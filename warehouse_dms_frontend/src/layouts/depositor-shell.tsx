import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Download, FileText, Globe, LayoutDashboard, LogOut, Search, Settings, TriangleAlert, Upload, User } from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/hooks/use-auth'
import { updatePreferredLanguage } from '@/lib/queries'
import { authStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'

/* ── Nav tab definitions ── */
const NAV_TABS = [
  { to: '/depositor',           label: 'Dashboard', icon: LayoutDashboard, end: true  },
  { to: '/depositor/documents', label: 'Documents', icon: FileText,        end: false },
  { to: '/depositor/downloads', label: 'Downloads', icon: Download,        end: false },
  { to: '/depositor/upload',    label: 'Upload',    icon: Upload,          end: false },
] as const

export function DepositorShell() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { profile, user, clearSession } = useAuth()
  const [headerSearch, setHeaderSearch] = useState('')
  const updateLanguageMutation = useMutation({
    mutationFn: updatePreferredLanguage,
    onSuccess: (nextProfile) => {
      if (nextProfile) authStore.getState().setProfile(nextProfile)
    },
  })

  const displayName = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || profile?.username || user?.userName || 'Depositor'
  const username    = profile?.username || user?.userName || ''
  const initials    = displayName.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()

  async function changeLanguage(language: 'en' | 'sw') {
    await i18n.changeLanguage(language)
    const currentProfile = authStore.getState().profile
    if (currentProfile) {
      authStore.getState().setProfile({ ...currentProfile, preferredLanguage: language })
      updateLanguageMutation.mutate({
        uniqueId: currentProfile.uniqueId,
        firstName: currentProfile.firstName,
        lastName: currentProfile.lastName,
        phoneNumber: currentProfile.phoneNumber,
        preferredLanguage: language,
      })
    }
  }

  function handleLogout() {
    clearSession()
    navigate('/login', { replace: true })
  }

  function handleHeaderSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const query = headerSearch.trim()
    navigate(query ? `/depositor/documents?q=${encodeURIComponent(query)}` : '/depositor/documents')
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-canvas text-text-primary">

      {/* ════════════════════════════════════════
          TOP BAR  (logo + search placeholder + avatar)
          — mirrors Gmail: logo left, avatar right
          ════════════════════════════════════════ */}
      <header
        className="sticky top-0 z-40 border-b"
        style={{
          background: 'var(--canvas)',
          borderColor: 'var(--border)',
        }}
      >
        {/* Row 1: brand + actions */}
        <div className="mx-auto flex w-full max-w-[520px] items-center justify-between px-4 py-2.5 sm:px-6">
          {/* Brand */}
          <button
            type="button"
            onClick={() => navigate('/depositor')}
            className="flex items-center gap-2"
          >
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ background: 'linear-gradient(135deg, var(--brand-teal) 0%, #0b57d0 100%)' }}
            >
              <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden>
                <rect x="2" y="6" width="16" height="10" rx="2" fill="white" fillOpacity="0.2" stroke="white" strokeWidth="1.4"/>
                <path d="M6 10h8M6 13h5" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
                <rect x="6" y="3" width="8" height="4" rx="1" fill="white" fillOpacity="0.35"/>
              </svg>
            </div>
            <span className="text-[15px] font-semibold tracking-tight text-text-primary">
              {t('app.name')}
            </span>
          </button>

          {/* Right side: Gmail-style avatar */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              {/* Gmail uses a plain coloured circle with initials and NO ring on idle */}
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-white transition-all hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                style={{
                  background: 'linear-gradient(135deg, var(--brand-teal) 0%, #0b57d0 100%)',
                  boxShadow: 'var(--shadow-sm)',
                }}
                aria-label="Account"
              >
                {initials || <User className="h-4 w-4" />}
              </button>
            </DropdownMenuTrigger>

            {/* ── Gmail account card dropdown ── */}
            <DropdownMenuContent
              align="end"
              className="w-72 overflow-hidden rounded-2xl p-0 shadow-xl"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
              }}
              sideOffset={8}
            >
              {/* Account header card */}
              <div
                className="flex flex-col items-center gap-2 px-6 py-5"
                style={{ borderBottom: '1px solid var(--border-subtle)' }}
              >
                {/* Large avatar */}
                <div
                  className="flex h-16 w-16 items-center justify-center rounded-full text-lg font-bold text-white"
                  style={{
                    background: 'linear-gradient(135deg, var(--brand-teal) 0%, #0b57d0 100%)',
                  }}
                >
                  {initials || <User className="h-6 w-6" />}
                </div>
                <div className="text-center">
                  <div className="text-sm font-semibold text-text-primary">{displayName}</div>
                  <div className="text-xs text-text-tertiary">{username}</div>
                </div>
                {/* "Manage your Account" pill — Gmail-style */}
                <button
                  type="button"
                  className="mt-1 rounded-full border px-4 py-1.5 text-xs font-medium transition-colors hover:bg-canvas"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                  onClick={() => navigate('/depositor')}
                >
                  Depositor Account
                </button>
              </div>

              {/* Language section */}
              <div className="px-2 py-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <div className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                  Language
                </div>
                <DropdownMenuItem
                  onSelect={() => changeLanguage('en')}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm"
                >
                  <Globe className="h-3.5 w-3.5 text-text-tertiary" />
                  English
                  {i18n.language === 'en' && (
                    <span className="ml-auto text-[10px] font-medium" style={{ color: 'var(--brand-teal)' }}>Active</span>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => changeLanguage('sw')}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm"
                >
                  <Globe className="h-3.5 w-3.5 text-text-tertiary" />
                  Kiswahili
                  {i18n.language === 'sw' && (
                    <span className="ml-auto text-[10px] font-medium" style={{ color: 'var(--brand-teal)' }}>Active</span>
                  )}
                </DropdownMenuItem>
              </div>

              {/* Settings + logout */}
              <div className="px-2 py-2">
                <DropdownMenuItem
                  onSelect={() => navigate('/depositor')}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-text-secondary"
                >
                  <Settings className="h-3.5 w-3.5" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator className="my-1" />
                <DropdownMenuItem
                  onSelect={handleLogout}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium"
                  style={{ color: 'var(--error)' }}
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Log out
                </DropdownMenuItem>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <div className="mx-auto w-full max-w-[520px] space-y-2 px-4 py-3 sm:px-6">
            <form onSubmit={handleHeaderSearchSubmit} className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
              <input
                value={headerSearch}
                onChange={(event) => setHeaderSearch(event.target.value)}
                placeholder="Search documents, titles, or warehouses"
                className="h-10 w-full rounded-full border border-border bg-surface pl-10 pr-4 text-sm text-text-primary outline-none transition-all placeholder:text-text-tertiary focus:border-[var(--brand-teal)]"
              />
            </form>

            <div className="flex gap-2 overflow-x-auto scrollbar-thin">
              <button type="button" onClick={() => navigate('/depositor/upload')} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                <Upload className="h-3.5 w-3.5" />
                New upload
              </button>
              <button type="button" onClick={() => navigate('/depositor/documents?filter=pending')} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                <FileText className="h-3.5 w-3.5" />
                My pending
              </button>
              <button type="button" onClick={() => navigate('/depositor/documents?filter=correction')} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium" style={{ borderColor: 'var(--error)', background: 'var(--error-bg)', color: 'var(--error)' }}>
                <TriangleAlert className="h-3.5 w-3.5" />
                Needs correction
              </button>
            </div>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <div className="mx-auto w-full max-w-[520px] px-4 sm:px-6">
            <div className="flex items-end justify-center gap-1 overflow-x-auto scrollbar-thin">
              {NAV_TABS.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      'relative flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors',
                      isActive ? 'text-brand-teal' : 'text-text-tertiary hover:text-text-secondary'
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon className="h-4 w-4" />
                      <span>{label}</span>
                      {isActive && (
                        <span
                          className="absolute bottom-0 left-0 right-0 h-[3px] rounded-t-full"
                          style={{ background: 'var(--brand-teal)' }}
                        />
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* ── Page content ── */}
      <main className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto w-full max-w-[520px] px-4 pb-10 pt-6 sm:px-6 sm:pt-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
