import { Link } from 'react-router-dom'
import { Bell, Users, Warehouse, Shield, ChevronRight, Building2 } from 'lucide-react'

import { PageHeader } from '@/components/common/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from '@/hooks/use-auth'

const SETTING_GROUPS = [
  {
    title: 'Notifications',
    description: 'Configure which events send email and in-app alerts.',
    icon: Bell,
    to: '/settings/notifications',
    colour: 'bg-sky-500/10 text-sky-700',
    roles: ['STAFF', 'MANAGER', 'CEO', 'ADMIN', 'DEPOSITOR', 'REGULATOR'],
  },
  {
    title: 'Users',
    description: 'View and manage system user accounts and roles.',
    icon: Users,
    to: '/admin/users',
    colour: 'bg-brand-teal/10 text-brand-teal',
    roles: ['ADMIN'],
  },
  {
    title: 'Tenants',
    description: 'Maintain tenant organisations and their regional assignments.',
    icon: Building2,
    to: '/admin/tenants',
    colour: 'bg-emerald-500/10 text-emerald-700',
    roles: ['ADMIN'],
  },
  {
    title: 'Warehouses',
    description: 'Register and manage warehouse facilities.',
    icon: Warehouse,
    to: '/admin/warehouses',
    colour: 'bg-amber-500/10 text-amber-700',
    roles: ['ADMIN'],
  },
  {
    title: 'Audit Log',
    description: 'Full history of all document workflow events.',
    icon: Shield,
    to: '/admin/audit',
    colour: 'bg-brand-terracotta/10 text-brand-terracotta',
    roles: ['ADMIN'],
  },
]

export function SettingsPage() {
  const { primaryRole } = useAuth()

  const visible = SETTING_GROUPS.filter((g) =>
    !g.roles?.length || (primaryRole ? g.roles.includes(primaryRole) : false)
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        subtitle="Manage your account preferences and system configuration."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((group) => {
          const Icon = group.icon
          return (
            <Link key={group.to} to={group.to} className="group block">
              <Card className="h-full transition-standard hover:border-brand-teal hover:shadow-md">
                <CardContent className="flex items-start gap-4 px-5 py-5">
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${group.colour}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-text-primary group-hover:text-brand-teal">{group.title}</p>
                      <ChevronRight className="h-4 w-4 text-text-tertiary transition-standard group-hover:text-brand-teal" />
                    </div>
                    <p className="mt-1 text-sm text-text-secondary">{group.description}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      <div className="rounded-xl border border-border bg-canvas px-5 py-4 text-sm text-text-secondary">
        <span className="font-semibold text-text-primary">System: </span>
        INTELA Warehouse DMS · Version 1.0 · API v1
      </div>
    </div>
  )
}
