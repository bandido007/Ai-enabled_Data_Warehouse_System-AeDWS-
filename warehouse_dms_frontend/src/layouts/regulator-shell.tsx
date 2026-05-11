import { Bell, FileSearch, LayoutDashboard, Menu, PanelLeftClose, PanelLeftOpen, Settings, ShieldCheck, Files, Upload } from 'lucide-react'
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { CommandPalette } from '@/components/layout/command-palette'
import { NotificationDropdown } from '@/components/layout/notification-dropdown'
import { UserAvatar } from '@/components/common/user-avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/hooks/use-auth'
import { updatePreferredLanguage } from '@/lib/queries'
import { authStore } from '@/stores/auth-store'

const regulatorNavItems = [
  { key: 'dashboard', labelKey: 'navigation.dashboard', to: '/regulator', icon: LayoutDashboard },
  { key: 'warehouses', labelKey: 'navigation.warehouseCompliance', to: '/regulator', icon: ShieldCheck },
  { key: 'documents', labelKey: 'navigation.approvedDocuments', to: '/regulator/documents', icon: Files },
  { key: 'upload', labelKey: 'navigation.uploadDocument', to: '/regulator/upload', icon: Upload },
  { key: 'inspections', labelKey: 'navigation.inspectionReports', to: '/regulator/inspections', icon: FileSearch },
  { key: 'notifications', labelKey: 'navigation.notifications', to: '/regulator/notifications', icon: Bell },
  { key: 'settings', labelKey: 'navigation.settings', to: '/settings/notifications', icon: Settings },
]

export function RegulatorShell() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { permissionSet, profile, user, clearSession, primaryRole } = useAuth()
  const [collapsed, setCollapsed] = useState(false)
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

  return (
    <div className="h-screen overflow-hidden bg-canvas text-text-primary">
      <header className="fixed inset-x-0 top-0 z-40 flex h-12 items-center justify-between border-b border-border bg-surface px-4 pl-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-text-secondary transition-standard hover:bg-border-subtle lg:hidden"
            onClick={() => setCollapsed((current) => !current)}
            aria-label={t('common.openMenu')}
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2.5 text-sm font-semibold tracking-[-0.01em]">
            <div className="relative h-[22px] w-[22px] rounded-[4px] bg-brand-teal before:absolute before:inset-[5px] before:rounded-[1px] before:bg-brand-terracotta before:content-['']" />
            <span>{t('app.name')}</span>
            <span className="hidden text-text-tertiary md:inline">/ {profile?.tenantName || t('regulator.jurisdictionFallback')}</span>
          </div>
        </div>

        <div className="mx-8 hidden flex-1 lg:flex">
          <CommandPalette permissionSet={permissionSet} primaryRole={primaryRole} />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setCollapsed((current) => !current)}
            className="hidden h-8 w-8 items-center justify-center rounded-sm text-text-secondary transition-standard hover:bg-border-subtle lg:inline-flex"
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
          <NotificationDropdown enabled={Boolean(profile)} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="rounded-full">
                <UserAvatar
                  user={{
                    firstName: profile?.firstName || user?.firstName,
                    lastName: profile?.lastName || user?.lastName,
                    username: profile?.username || user?.userName,
                  }}
                  size="sm"
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{profile?.firstName || profile?.username || user?.userName}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{t('common.language')}</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => changeLanguage('en')}>{t('common.english')}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => changeLanguage('sw')}>{t('common.swahili')}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => navigate('/settings/notifications')}>{t('navigation.settings')}</DropdownMenuItem>
              <DropdownMenuItem onSelect={handleLogout}>{t('auth.logout')}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex pt-12">
        <aside className={`fixed bottom-0 left-0 top-12 z-30 border-r border-border bg-surface px-3 py-4 transition-standard ${collapsed ? 'w-[60px]' : 'w-[240px]'}`}>
          <nav>
            <div className="mb-1 px-3 font-mono text-[11px] uppercase tracking-[0.05em] text-text-tertiary">{t('regulator.subtitle')}</div>
            <div className="space-y-1">
              {regulatorNavItems.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.key}
                    to={item.to}
                    end={item.to === '/regulator'}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 rounded-sm px-3 py-[7px] text-sm transition-standard ${
                        isActive
                          ? 'bg-brand-teal/10 font-medium text-brand-teal'
                          : 'text-text-secondary hover:bg-border-subtle hover:text-text-primary'
                      }`
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {!collapsed ? <span>{t(item.labelKey)}</span> : null}
                  </NavLink>
                )
              })}
            </div>
          </nav>
        </aside>

        <main className={`h-[calc(100vh-48px)] min-w-0 flex-1 overflow-hidden transition-standard ${collapsed ? 'ml-[60px]' : 'ml-[240px]'}`}>
          <div className="page-shell box-border h-full overflow-y-auto py-8 scrollbar-thin">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
