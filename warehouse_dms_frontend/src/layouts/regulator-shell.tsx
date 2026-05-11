import { Bell, ChevronLeft, ChevronRight, FileSearch, Files, Globe, LayoutDashboard, LogOut, Moon, Settings, ShieldCheck, Sun, Upload, User } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { CommandPalette } from '@/components/layout/command-palette'
import { NotificationDropdown } from '@/components/layout/notification-dropdown'
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

const regulatorNavItems = [
  { key: 'dashboard', labelKey: 'navigation.dashboard', to: '/regulator', icon: LayoutDashboard },
  { key: 'warehouses', labelKey: 'navigation.warehouseCompliance', to: '/regulator/warehouses', icon: ShieldCheck },
  { key: 'documents', labelKey: 'navigation.approvedDocuments', to: '/regulator/documents', icon: Files },
  { key: 'upload', labelKey: 'navigation.uploadDocument', to: '/regulator/upload', icon: Upload },
  { key: 'inspections', labelKey: 'navigation.inspectionReports', to: '/regulator/inspections', icon: FileSearch },
  { key: 'notifications', labelKey: 'navigation.notifications', to: '/regulator/notifications', icon: Bell },
  { key: 'settings', labelKey: 'navigation.settings', to: '/settings/notifications', icon: Settings },
]

function AeDWSLogo({ size = 28, tone = 'light' }: { size?: number; tone?: 'light' | 'dark' }) {
  const isDark = tone === 'dark'
  const accent = isDark ? '#a8c7fa' : '#0b57d0'
  const accentSoft = isDark ? '#d2e3fc' : '#5e97f6'
  const panelFill = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(11,87,208,0.06)'
  const panelStroke = isDark ? 'rgba(255,255,255,0.24)' : 'rgba(32,33,36,0.18)'
  const midFill = isDark ? 'rgba(168,199,250,0.14)' : 'rgba(26,115,232,0.12)'
  const midStroke = isDark ? 'rgba(168,199,250,0.46)' : 'rgba(11,87,208,0.34)'
  const bright = isDark ? '#ffffff' : '#1f1f1f'
  const brightSoft = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(32,33,36,0.32)'
  const dot = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(32,33,36,0.45)'
  const gradientId = `regulatorPGrad-${tone}`

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="46" stroke={accent} strokeWidth="1.8" strokeDasharray="6 3" opacity="0.6" />
      <polygon points="50,88 13,60 28,40 72,40 87,60" fill={panelFill} stroke={panelStroke} strokeWidth="1.2" strokeLinejoin="round" />
      <polygon points="50,76 19,59 32,44 68,44 81,59" fill={panelFill} stroke={panelStroke} strokeWidth="1" strokeLinejoin="round" />
      <line x1="29" y1="56" x2="50" y2="56" stroke={accent} strokeWidth="0.9" opacity="0.6" />
      <line x1="50" y1="56" x2="71" y2="56" stroke={accent} strokeWidth="0.9" opacity="0.6" />
      <rect x="33" y="53" width="4" height="4" rx="0.5" fill="none" stroke={accent} strokeWidth="0.8" opacity="0.7" />
      <rect x="63" y="53" width="4" height="4" rx="0.5" fill="none" stroke={accent} strokeWidth="0.8" opacity="0.7" />
      <polygon points="50,64 24,49 37,36 63,36 76,49" fill={midFill} stroke={midStroke} strokeWidth="1" strokeLinejoin="round" />
      <polygon points="50,52 45,49 45,43 50,40 55,43 55,49" fill="none" stroke={brightSoft} strokeWidth="0.9" />
      <polygon points="50,18 28,42 72,42" fill={`url(#${gradientId})`} />
      <line x1="50" y1="18" x2="28" y2="42" stroke={bright} strokeWidth="1" opacity="0.7" />
      <line x1="50" y1="18" x2="72" y2="42" stroke={bright} strokeWidth="1" opacity="0.7" />
      <line x1="28" y1="42" x2="72" y2="42" stroke={bright} strokeWidth="0.8" opacity="0.3" />
      <circle cx="50" cy="18" r="4" fill={bright} opacity="0.95" />
      <circle cx="50" cy="18" r="8" fill={accent} opacity="0.2" />
      <circle cx="50" cy="4" r="2.5" fill={accent} />
      <circle cx="96" cy="50" r="2" fill={dot} opacity="0.8" />
      <circle cx="4" cy="50" r="2" fill={dot} opacity="0.8" />
      <defs>
        <linearGradient id={gradientId} x1="50" y1="18" x2="50" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={bright} stopOpacity="0.95" />
          <stop offset="55%" stopColor={accentSoft} stopOpacity="0.78" />
          <stop offset="100%" stopColor={accent} stopOpacity="0.45" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export function RegulatorShell() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { permissionSet, profile, user, clearSession, primaryRole } = useAuth()
  const [collapsed, setCollapsed] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
  )
  const updateLanguageMutation = useMutation({
    mutationFn: updatePreferredLanguage,
    onSuccess: (nextProfile) => {
      if (nextProfile) {
        authStore.getState().setProfile(nextProfile)
      }
    },
  })

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

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    window.localStorage.setItem('aedws-theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))

  const displayName = [profile?.firstName || user?.firstName, profile?.lastName || user?.lastName].filter(Boolean).join(' ') || profile?.username || user?.userName || 'Regulator'
  const username = profile?.username || user?.userName || ''
  const initials = displayName
    .split(' ')
    .map((word) => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  const railWidth = collapsed ? 'w-[62px]' : 'w-[232px]'

  return (
    <div className="flex h-screen overflow-hidden bg-canvas text-text-primary">
      <aside
        className={`${railWidth} relative flex shrink-0 flex-col transition-all duration-200`}
        style={{ background: 'var(--admin-sidebar-bg)', borderRight: '1px solid var(--admin-sidebar-border)' }}
      >
        <div className="flex h-14 items-center px-4" style={{ borderBottom: '1px solid var(--admin-sidebar-border)' }}>
          <AeDWSLogo size={28} />
          {!collapsed && (
            <div className="ml-3 overflow-hidden">
              <div className="truncate text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--admin-sidebar-title)' }}>AeWDMS</div>
              <div className="truncate text-[9px] uppercase tracking-wider" style={{ color: 'var(--admin-sidebar-muted)' }}>Ai enabled warehouse</div>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-3">
          {!collapsed && (
            <p className="mb-1.5 px-2 text-[9px] font-semibold uppercase tracking-widest" style={{ color: 'var(--admin-sidebar-muted)' }}>
              {t('regulator.subtitle')}
            </p>
          )}
          <ul className="space-y-0.5">
            {regulatorNavItems.map((item) => {
              const Icon = item.icon
              return (
                <li key={item.key}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/regulator'}
                    className={({ isActive }) =>
                      `group relative flex items-center gap-3 rounded-lg px-2.5 py-[7px] text-[13px] font-medium transition-all duration-150 ${
                        isActive ? '' : 'hover:opacity-80'
                      }`
                    }
                    style={({ isActive }) => ({
                      background: isActive ? 'var(--admin-sidebar-active-bg)' : 'transparent',
                      color: isActive ? 'var(--admin-sidebar-active-text)' : 'var(--admin-sidebar-muted)',
                    })}
                    title={collapsed ? t(item.labelKey) : undefined}
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <span
                            className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full"
                            style={{ background: 'var(--admin-sidebar-active-text)' }}
                          />
                        )}
                        <Icon
                          className="h-4 w-4 shrink-0"
                          style={{ color: isActive ? 'var(--admin-sidebar-active-text)' : 'var(--admin-sidebar-icon)' }}
                        />
                        {!collapsed && <span className="truncate">{t(item.labelKey)}</span>}
                      </>
                    )}
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </nav>

        <button
          type="button"
          onClick={() => setCollapsed((current) => !current)}
          className="absolute -right-3 top-16 flex h-6 w-6 items-center justify-center rounded-full border transition-all"
          style={{ background: 'var(--admin-panel-bg)', borderColor: 'var(--admin-panel-border)', color: 'var(--admin-sidebar-muted)', zIndex: 10 }}
          aria-label={collapsed ? t('common.openMenu') : 'Collapse menu'}
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-4 px-6" style={{ borderBottom: '1px solid var(--admin-header-border)' }}>
          <div className="hidden min-w-0 flex-1 lg:flex">
            <CommandPalette permissionSet={permissionSet} primaryRole={primaryRole} />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                background: 'var(--admin-button-bg)',
                border: '1px solid var(--admin-panel-border)',
                color: 'var(--text-secondary)',
              }}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
            </button>
            <div className="hidden min-w-0 text-right sm:block">
              <div className="truncate text-xs font-medium text-text-primary">{displayName}</div>
              <div className="truncate text-[11px] text-text-tertiary">{profile?.tenantName || t('regulator.jurisdictionFallback')}</div>
            </div>
            <NotificationDropdown enabled={Boolean(profile)} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-white transition-all hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                  style={{
                    background: 'linear-gradient(135deg, #1a73e8 0%, #0b57d0 100%)',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                  aria-label="Regulator account"
                >
                  {initials || <User className="h-4 w-4" />}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-72 overflow-hidden rounded-2xl p-0 shadow-xl"
                style={{
                  background: 'var(--admin-panel-bg)',
                  border: '1px solid var(--admin-panel-border)',
                }}
                sideOffset={10}
              >
                <div className="flex flex-col items-center gap-2 px-6 py-5" style={{ borderBottom: '1px solid var(--admin-panel-border)' }}>
                  <div
                    className="flex h-16 w-16 items-center justify-center rounded-full text-lg font-bold text-white"
                    style={{ background: 'linear-gradient(135deg, #1a73e8 0%, #0b57d0 100%)' }}
                  >
                    {initials || <User className="h-6 w-6" />}
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{displayName}</div>
                    <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{username}</div>
                    <div className="mt-1 text-[11px] uppercase tracking-wide" style={{ color: 'var(--admin-sidebar-muted)' }}>{primaryRole || 'Regulator'}</div>
                  </div>
                  <button
                    type="button"
                    className="mt-1 rounded-full border px-4 py-1.5 text-xs font-medium transition-colors"
                    style={{ borderColor: 'var(--admin-panel-border)', color: 'var(--text-secondary)' }}
                    onClick={() => navigate('/settings/notifications')}
                  >
                    {t('navigation.settings')}
                  </button>
                </div>

                <div className="px-2 py-2" style={{ borderBottom: '1px solid var(--admin-panel-border)' }}>
                  <div className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--admin-sidebar-muted)' }}>
                    {t('common.language')}
                  </div>
                  <DropdownMenuItem onSelect={() => changeLanguage('en')} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm">
                    <Globe className="h-3.5 w-3.5" style={{ color: 'var(--text-secondary)' }} />
                    {t('common.english')}
                    {i18n.language === 'en' && (
                      <span className="ml-auto text-[10px] font-medium" style={{ color: 'var(--color-primary)' }}>Active</span>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => changeLanguage('sw')} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm">
                    <Globe className="h-3.5 w-3.5" style={{ color: 'var(--text-secondary)' }} />
                    {t('common.swahili')}
                    {i18n.language === 'sw' && (
                      <span className="ml-auto text-[10px] font-medium" style={{ color: 'var(--color-primary)' }}>Active</span>
                    )}
                  </DropdownMenuItem>
                </div>

                <div className="px-2 py-2">
                  <DropdownMenuItem
                    onSelect={() => navigate('/settings/notifications')}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <Settings className="h-3.5 w-3.5" />
                    {t('navigation.settings')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="my-1" />
                  <DropdownMenuItem
                    onSelect={handleLogout}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium"
                    style={{ color: 'var(--error)' }}
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    {t('auth.logout')}
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-hidden">
          <div className="page-shell box-border h-full overflow-y-auto px-6 py-6 scrollbar-thin">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
