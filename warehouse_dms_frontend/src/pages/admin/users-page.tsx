import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Loader2, Plus, Search, Shield, ShieldCheck, UserCheck, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/hooks/use-auth'
import { deleteEnvelope, getItem, getList, postEnvelope, putEnvelope } from '@/lib/api'
import type { UserProfile, UserRole, Warehouse } from '@/types/api'

const ROLE_COLOR: Record<string, { bg: string; text: string }> = {
  ADMIN: { bg: 'var(--error-bg)', text: 'var(--error)' },
  MANAGER: { bg: 'var(--info-bg)', text: 'var(--info)' },
  CEO: { bg: 'rgba(161,66,244,0.14)', text: '#a142f4' },
  STAFF: { bg: 'var(--warning-bg)', text: 'var(--warning)' },
  DEPOSITOR: { bg: 'rgba(26,115,232,0.10)', text: '#1a73e8' },
  REGULATOR: { bg: 'var(--success-bg)', text: 'var(--success)' },
}

const ROLE_HINTS: Record<string, string> = {
  ADMIN: 'Full system administration, user oversight, warehouse setup, and audit access.',
  CEO: 'Cross-warehouse visibility, executive reporting, and high-level approvals.',
  MANAGER: 'Warehouse supervision, team oversight, and manager-stage review authority.',
  STAFF: 'Operational processing, document review, and day-to-day warehouse workflows.',
  DEPOSITOR: 'External depositor access for uploads, tracking, and document follow-up.',
  REGULATOR: 'Regulatory monitoring, compliance review, and cross-warehouse oversight.',
}

const FALLBACK_ROLE_OPTIONS: RoleDefinition[] = [
  { id: 1, uniqueId: 'ADMIN', name: 'ADMIN', description: ROLE_HINTS.ADMIN, isSeeded: true },
  { id: 2, uniqueId: 'CEO', name: 'CEO', description: ROLE_HINTS.CEO, isSeeded: true },
  { id: 3, uniqueId: 'MANAGER', name: 'MANAGER', description: ROLE_HINTS.MANAGER, isSeeded: true },
  { id: 4, uniqueId: 'STAFF', name: 'STAFF', description: ROLE_HINTS.STAFF, isSeeded: true },
  { id: 5, uniqueId: 'DEPOSITOR', name: 'DEPOSITOR', description: ROLE_HINTS.DEPOSITOR, isSeeded: true },
  { id: 6, uniqueId: 'REGULATOR', name: 'REGULATOR', description: ROLE_HINTS.REGULATOR, isSeeded: true },
]

const SCOPE_REQUIRED_ROLES = new Set<UserRole>(['CEO', 'MANAGER', 'STAFF', 'DEPOSITOR'])

const EMPTY_CREATE_FORM: CreateUserFormState = {
  username: '',
  email: '',
  password: '',
  firstName: '',
  lastName: '',
  phoneNumber: '',
  roleName: 'DEPOSITOR',
  tenantUniqueId: '',
  warehouseUniqueId: '',
}

interface TenantRecord {
  id: number
  uniqueId: string
  name: string
  regionName?: string | null
}

interface RoleDefinition {
  id: number
  uniqueId: string
  name: string
  description?: string
  isSeeded: boolean
}

interface CreateUserFormState {
  username: string
  email: string
  password: string
  firstName: string
  lastName: string
  phoneNumber: string
  roleName: UserRole
  tenantUniqueId: string
  warehouseUniqueId: string
}

interface EditUserFormState extends CreateUserFormState {
  uniqueId: string
  hasBeenVerified: boolean
}

function getUserRole(user: UserProfile & Record<string, unknown>) {
  const role = user.accountType ?? user.roleName ?? user.account_type
  return typeof role === 'string' && role.length > 0 ? role : 'DEPOSITOR'
}

function isUserVerified(user: UserProfile & Record<string, unknown>) {
  const verified = user.hasBeenVerified ?? user.isVerified ?? user.has_been_verified
  return Boolean(verified)
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim().length > 0 ? error.message : fallback
}

function needsAssignmentScope(roleName: string) {
  return SCOPE_REQUIRED_ROLES.has(roleName as UserRole)
}

function StatCard({ icon, label, value, accent, accentBg }: { icon: React.ReactNode; label: string; value: number | string; accent: string; accentBg: string }) {
  return (
    <div
      className="flex items-center gap-4 rounded-xl p-5"
      style={{ background: 'var(--admin-panel-bg)', border: '1px solid var(--admin-panel-border)', boxShadow: 'var(--shadow-sm)' }}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: accentBg }}>
        <span style={{ color: accent }}>{icon}</span>
      </div>
      <div>
        <div className="text-2xl font-bold text-text-primary">{value}</div>
        <div className="text-xs text-text-tertiary">{label}</div>
      </div>
    </div>
  )
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').map((word) => word[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
      style={{ background: 'var(--admin-avatar-bg)', color: 'var(--admin-avatar-text)' }}
    >
      {initials}
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label>{label}</Label>
        {hint ? <p className="text-xs text-text-tertiary">{hint}</p> : null}
      </div>
      {children}
    </div>
  )
}

function buildEditForm(user: UserProfile & Record<string, unknown>): EditUserFormState {
  return {
    uniqueId: user.uniqueId,
    username: user.username,
    email: user.email,
    password: '',
    firstName: user.firstName,
    lastName: user.lastName,
    phoneNumber: user.phoneNumber,
    roleName: getUserRole(user) as UserRole,
    tenantUniqueId: typeof user.tenantUniqueId === 'string' ? user.tenantUniqueId : '',
    warehouseUniqueId: typeof user.warehouseUniqueId === 'string' ? user.warehouseUniqueId : '',
    hasBeenVerified: isUserVerified(user),
  }
}

const PAGE_SIZE = 8

export function UsersPage() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { user: sessionUser } = useAuth()

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [roleDialogOpen, setRoleDialogOpen] = useState(false)
  const [createForm, setCreateForm] = useState<CreateUserFormState>(EMPTY_CREATE_FORM)
  const [editForm, setEditForm] = useState<EditUserFormState | null>(null)
  const [selectedUser, setSelectedUser] = useState<(UserProfile & Record<string, unknown>) | null>(null)
  const [selectedRoleName, setSelectedRoleName] = useState<UserRole>('DEPOSITOR')
  const [resetPassword, setResetPassword] = useState('')

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => getList<UserProfile>('/accounts/users', { itemsPerPage: 200 }).then((response) => response.data ?? []),
  })

  const { data: rolesData = [] } = useQuery({
    queryKey: ['admin-role-options'],
    queryFn: () => getItem<RoleDefinition[]>('/auth/roles').then((response) => response ?? []),
  })

  const { data: tenants = [] } = useQuery({
    queryKey: ['admin-tenants'],
    queryFn: () => getList<TenantRecord>('/tenants/', { itemsPerPage: 200 }).then((response) => response.data ?? []),
  })

  const { data: warehouses = [] } = useQuery({
    queryKey: ['admin-warehouses'],
    queryFn: () => getList<Warehouse>('/tenants/warehouses', { itemsPerPage: 200 }).then((response) => response.data ?? []),
  })

  const roleOptions = rolesData.length > 0 ? rolesData : FALLBACK_ROLE_OPTIONS

  const filtered = useMemo(
    () => users.filter((user) => `${user.firstName} ${user.lastName} ${user.username} ${user.email}`.toLowerCase().includes(search.toLowerCase())),
    [users, search],
  )

  useEffect(() => {
    setPage(1)
  }, [search])

  const selectedTenant = useMemo(
    () => tenants.find((tenant) => tenant.uniqueId === createForm.tenantUniqueId) ?? null,
    [createForm.tenantUniqueId, tenants],
  )

  const filteredWarehouses = useMemo(() => {
    if (!selectedTenant) {
      return warehouses
    }

    return warehouses.filter((warehouse) => warehouse.tenantId === selectedTenant.id)
  }, [selectedTenant, warehouses])

  const selectedCreateRole = useMemo(
    () => roleOptions.find((role) => role.name === createForm.roleName) ?? null,
    [createForm.roleName, roleOptions],
  )

  const selectedEditTenant = useMemo(
    () => tenants.find((tenant) => tenant.uniqueId === editForm?.tenantUniqueId) ?? null,
    [editForm?.tenantUniqueId, tenants],
  )

  const filteredEditWarehouses = useMemo(() => {
    if (!selectedEditTenant) {
      return warehouses
    }

    return warehouses.filter((warehouse) => warehouse.tenantId === selectedEditTenant.id)
  }, [selectedEditTenant, warehouses])

  useEffect(() => {
    if (
      createForm.warehouseUniqueId &&
      !filteredWarehouses.some((warehouse) => warehouse.uniqueId === createForm.warehouseUniqueId)
    ) {
      setCreateForm((current) => ({ ...current, warehouseUniqueId: '' }))
    }
  }, [createForm.warehouseUniqueId, filteredWarehouses])

  useEffect(() => {
    if (
      editForm?.warehouseUniqueId &&
      !filteredEditWarehouses.some((warehouse) => warehouse.uniqueId === editForm.warehouseUniqueId)
    ) {
      setEditForm((current) => (current ? { ...current, warehouseUniqueId: '' } : current))
    }
  }, [editForm?.warehouseUniqueId, filteredEditWarehouses])

  const createUserMutation = useMutation({
    mutationFn: async (payload: CreateUserFormState) => {
      const chosenWarehouse = warehouses.find((warehouse) => warehouse.uniqueId === payload.warehouseUniqueId)
      const inferredTenant = tenants.find((tenant) => tenant.id === chosenWarehouse?.tenantId)
      const tenantUniqueId = payload.tenantUniqueId || inferredTenant?.uniqueId || undefined

      if (needsAssignmentScope(payload.roleName) && !tenantUniqueId && !payload.warehouseUniqueId) {
        throw new Error('Select a tenant or warehouse for this role before saving.')
      }

      await postEnvelope('/accounts/users/create', {
        username: payload.username.trim(),
        email: payload.email.trim(),
        password: payload.password,
        firstName: payload.firstName.trim(),
        lastName: payload.lastName.trim(),
        phoneNumber: payload.phoneNumber.trim(),
        accountType: payload.roleName,
        roleName: payload.roleName,
        tenantUniqueId,
        warehouseUniqueId: payload.warehouseUniqueId || undefined,
      })
    },
    onSuccess: async () => {
      toast({
        title: 'User created',
        description: 'The new account is ready for sign-in and role-based access.',
      })
      setCreateDialogOpen(false)
      setCreateForm(EMPTY_CREATE_FORM)
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
    onError: (error) => {
      toast({
        title: 'Unable to create user',
        description: getErrorMessage(error, 'Check the form details and try again.'),
        variant: 'destructive',
      })
    },
  })

  const assignRoleMutation = useMutation({
    mutationFn: async (payload: { userUniqueId: string; roleName: UserRole }) => {
      await postEnvelope('/auth/roles/assign', payload)
    },
    onSuccess: async () => {
      toast({
        title: 'Role updated',
        description: 'The selected user now has the updated role permissions.',
      })
      setRoleDialogOpen(false)
      setSelectedUser(null)
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
    onError: (error) => {
      toast({
        title: 'Unable to update role',
        description: getErrorMessage(error, 'Try again in a moment.'),
        variant: 'destructive',
      })
    },
  })

  const updateUserMutation = useMutation({
    mutationFn: async (payload: EditUserFormState) => {
      await putEnvelope(`/accounts/users/${payload.uniqueId}`, {
        username: payload.username.trim(),
        email: payload.email.trim(),
        firstName: payload.firstName.trim(),
        lastName: payload.lastName.trim(),
        phoneNumber: payload.phoneNumber.trim(),
        accountType: payload.roleName,
        roleName: payload.roleName,
        hasBeenVerified: payload.hasBeenVerified,
        tenantUniqueId: payload.tenantUniqueId || undefined,
        warehouseUniqueId: payload.warehouseUniqueId || undefined,
      })
    },
    onSuccess: async () => {
      toast({
        title: 'User updated',
        description: 'Account details, role, and access scope were saved.',
      })
      setEditDialogOpen(false)
      setEditForm(null)
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
    onError: (error) => {
      toast({
        title: 'Unable to update user',
        description: getErrorMessage(error, 'Review the user details and try again.'),
        variant: 'destructive',
      })
    },
  })

  const resetPasswordMutation = useMutation({
    mutationFn: async (payload: { uniqueId: string; newPassword: string }) => {
      await postEnvelope(`/accounts/users/${payload.uniqueId}/reset-password`, {
        newPassword: payload.newPassword,
      })
    },
    onSuccess: () => {
      toast({
        title: 'Password reset',
        description: 'The temporary password was updated successfully.',
      })
      setResetPassword('')
    },
    onError: (error) => {
      toast({
        title: 'Unable to reset password',
        description: getErrorMessage(error, 'Try a different temporary password.'),
        variant: 'destructive',
      })
    },
  })

  const deactivateUserMutation = useMutation({
    mutationFn: async (uniqueId: string) => {
      await deleteEnvelope(`/accounts/users/${uniqueId}`)
    },
    onSuccess: async () => {
      toast({
        title: 'User deactivated',
        description: 'The account was removed from active access.',
      })
      setEditDialogOpen(false)
      setEditForm(null)
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
    onError: (error) => {
      toast({
        title: 'Unable to deactivate user',
        description: getErrorMessage(error, 'Try again in a moment.'),
        variant: 'destructive',
      })
    },
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const verified = users.filter((user) => isUserVerified(user as UserProfile & Record<string, unknown>)).length
  const pending = users.filter((user) => !isUserVerified(user as UserProfile & Record<string, unknown>)).length

  function updateCreateForm<K extends keyof CreateUserFormState>(field: K, value: CreateUserFormState[K]) {
    setCreateForm((current) => ({ ...current, [field]: value }))
  }

  function updateEditForm<K extends keyof EditUserFormState>(field: K, value: EditUserFormState[K]) {
    setEditForm((current) => (current ? { ...current, [field]: value } : current))
  }

  function openEditDialog(user: UserProfile & Record<string, unknown>) {
    setEditForm(buildEditForm(user))
    setResetPassword('')
    setEditDialogOpen(true)
  }

  function openRoleDialog(user: UserProfile & Record<string, unknown>) {
    setSelectedUser(user)
    setSelectedRoleName(getUserRole(user) as UserRole)
    setRoleDialogOpen(true)
  }

  function handleCreateRoleChange(value: string) {
    const roleName = value as UserRole
    setCreateForm((current) => ({
      ...current,
      roleName,
      tenantUniqueId: needsAssignmentScope(roleName) ? current.tenantUniqueId : '',
      warehouseUniqueId: needsAssignmentScope(roleName) ? current.warehouseUniqueId : '',
    }))
  }

  function handleEditRoleChange(value: string) {
    const roleName = value as UserRole
    setEditForm((current) => {
      if (!current) {
        return current
      }

      return {
        ...current,
        roleName,
        tenantUniqueId: needsAssignmentScope(roleName) ? current.tenantUniqueId : '',
        warehouseUniqueId: needsAssignmentScope(roleName) ? current.warehouseUniqueId : '',
      }
    })
  }

  async function handleCreateUserSubmit() {
    if (!createForm.username.trim() || !createForm.email.trim() || !createForm.password.trim()) {
      toast({
        title: 'Missing required fields',
        description: 'Username, email, and password are required.',
        variant: 'destructive',
      })
      return
    }

    await createUserMutation.mutateAsync(createForm)
  }

  async function handleAssignRoleSubmit() {
    if (!selectedUser) {
      return
    }

    await assignRoleMutation.mutateAsync({
      userUniqueId: selectedUser.uniqueId,
      roleName: selectedRoleName,
    })
  }

  async function handleUpdateUserSubmit() {
    if (!editForm) {
      return
    }

    if (!editForm.username.trim() || !editForm.email.trim()) {
      toast({
        title: 'Missing required fields',
        description: 'Username and email are required for existing users.',
        variant: 'destructive',
      })
      return
    }

    await updateUserMutation.mutateAsync(editForm)
  }

  async function handleResetPasswordSubmit() {
    if (!editForm) {
      return
    }

    if (!resetPassword.trim()) {
      toast({
        title: 'Password required',
        description: 'Enter a temporary password before resetting the account.',
        variant: 'destructive',
      })
      return
    }

    await resetPasswordMutation.mutateAsync({
      uniqueId: editForm.uniqueId,
      newPassword: resetPassword,
    })
  }

  async function handleDeactivateUser() {
    if (!editForm) {
      return
    }

    await deactivateUserMutation.mutateAsync(editForm.uniqueId)
  }

  return (
    <div className="flex flex-col gap-5 pb-6">
      <div className="flex shrink-0 items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">User Management</h1>
          <p className="mt-0.5 text-sm text-text-tertiary">Manage system accounts, roles, and warehouse access assignments</p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Add user
        </Button>
      </div>

      <div className="grid shrink-0 grid-cols-3 gap-4">
        <StatCard icon={<Users className="h-5 w-5" />} label="Total Users" value={users.length} accent="var(--info)" accentBg="var(--info-bg)" />
        <StatCard icon={<UserCheck className="h-5 w-5" />} label="Verified" value={verified} accent="var(--success)" accentBg="var(--success-bg)" />
        <StatCard icon={<Shield className="h-5 w-5" />} label="Pending Review" value={pending} accent="var(--warning)" accentBg="var(--warning-bg)" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl" style={{ background: 'var(--admin-panel-bg)', border: '1px solid var(--admin-panel-border)', boxShadow: 'var(--shadow-sm)' }}>
        <div className="flex items-center gap-3 px-4 py-3" style={{ background: 'var(--admin-panel-subtle-bg)', borderBottom: '1px solid var(--admin-row-border)' }}>
          <Search className="h-4 w-4 shrink-0 text-text-tertiary" />
          <Input
            placeholder={t('common.search', 'Search users…')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-8 max-w-xs border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
          />
        </div>

        <div className="flex-1 overflow-y-auto" style={{ background: 'var(--admin-panel-bg)' }}>
          <div
            className="grid px-4 py-2.5 text-[11px] font-semibold uppercase tracking-widest"
            style={{
              gridTemplateColumns: '1.8fr 1.4fr 0.9fr 1.2fr 90px 120px',
              color: 'var(--text-tertiary)',
              borderBottom: '1px solid var(--admin-row-border)',
              background: 'var(--admin-panel-subtle-bg)',
            }}
          >
            <span>Name</span>
            <span>Email</span>
            <span>Role</span>
            <span>Scope</span>
            <span>Status</span>
            <span>Actions</span>
          </div>

          {isLoading
            ? Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="grid items-center gap-4 px-4 py-3" style={{ gridTemplateColumns: '1.8fr 1.4fr 0.9fr 1.2fr 90px 120px', borderBottom: '1px solid var(--admin-row-border)' }}>
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-8 w-28" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-8 w-20 rounded-md" />
                </div>
              ))
            : paged.map((user, index) => {
                const resolvedUser = user as UserProfile & Record<string, unknown>
                const role = getUserRole(resolvedUser)
                const verifiedUser = isUserVerified(resolvedUser)
                const roleColor = ROLE_COLOR[role] ?? { bg: 'var(--admin-panel-subtle-bg)', text: 'var(--text-secondary)' }
                const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.username
                const isCurrentAdmin = user.username === sessionUser?.userName

                return (
                  <div
                    key={user.id}
                    className="grid items-center px-4 py-2.5 text-sm transition-colors"
                    style={{
                      gridTemplateColumns: '1.8fr 1.4fr 0.9fr 1.2fr 90px 120px',
                      borderBottom: index < paged.length - 1 ? '1px solid var(--admin-row-border)' : 'none',
                      background: 'transparent',
                    }}
                    onMouseEnter={(event) => {
                      event.currentTarget.style.background = 'var(--admin-hover-bg)'
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.background = 'transparent'
                    }}
                  >
                    <div className="flex items-center gap-2.5">
                      <Avatar name={name} />
                      <div>
                        <div className="font-medium text-text-primary">{name}</div>
                        <div className="text-xs text-text-tertiary">@{user.username}</div>
                      </div>
                    </div>
                    <span className="truncate text-text-secondary">{user.email}</span>
                    <span className="w-fit rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ background: roleColor.bg, color: roleColor.text }}>
                      {role}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-text-secondary">{user.tenantName ?? 'Unassigned tenant'}</div>
                      <div className="truncate text-xs text-text-tertiary">{user.warehouseName ?? 'No warehouse linked'}</div>
                    </div>
                    <span
                      className="w-fit rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                      style={{
                        background: verifiedUser ? 'rgba(52,211,153,0.12)' : 'rgba(251,191,36,0.12)',
                        color: verifiedUser ? '#34d399' : '#fbbf24',
                      }}
                    >
                      {verifiedUser ? 'Verified' : 'Pending'}
                    </span>
                    <div className="flex items-center justify-start gap-2">
                      <Button size="sm" variant="secondary" onClick={() => openEditDialog(resolvedUser)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openRoleDialog(resolvedUser)}
                        disabled={isCurrentAdmin}
                        title={isCurrentAdmin ? 'Current admin role cannot be changed here' : 'Change assigned role'}
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Role
                      </Button>
                    </div>
                  </div>
                )
              })}

          {!isLoading && paged.length === 0 && <div className="py-16 text-center text-sm text-text-tertiary">No users found</div>}
        </div>
      </div>

      <Dialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          setCreateDialogOpen(open)
          if (!open && !createUserMutation.isPending) {
            setCreateForm(EMPTY_CREATE_FORM)
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Create a new user</DialogTitle>
            <DialogDescription>
              Add the account, assign the correct role, and connect the user to the right tenant or warehouse.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 md:grid-cols-[1.45fr_0.95fr]">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Username" hint="Used for login and audit history.">
                <Input value={createForm.username} onChange={(event) => updateCreateForm('username', event.target.value)} placeholder="e.g. staff.dodoma" />
              </Field>

              <Field label="Email" hint="Primary contact for the account.">
                <Input type="email" value={createForm.email} onChange={(event) => updateCreateForm('email', event.target.value)} placeholder="name@example.com" />
              </Field>

              <Field label="First name">
                <Input value={createForm.firstName} onChange={(event) => updateCreateForm('firstName', event.target.value)} placeholder="First name" />
              </Field>

              <Field label="Last name">
                <Input value={createForm.lastName} onChange={(event) => updateCreateForm('lastName', event.target.value)} placeholder="Last name" />
              </Field>

              <Field label="Phone number">
                <Input value={createForm.phoneNumber} onChange={(event) => updateCreateForm('phoneNumber', event.target.value)} placeholder="+255 …" />
              </Field>

              <Field label="Temporary password" hint="The user can change it after first sign-in.">
                <Input type="password" value={createForm.password} onChange={(event) => updateCreateForm('password', event.target.value)} placeholder="Create a secure password" />
              </Field>

              <Field label="Role" hint="Role selection controls the permission bundle for this user.">
                <Select value={createForm.roleName} onValueChange={handleCreateRoleChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((role) => (
                      <SelectItem key={role.uniqueId} value={role.name}>
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Tenant" hint={needsAssignmentScope(createForm.roleName) ? 'Assign the organisation or business unit this user belongs to.' : 'Optional for this role.'}>
                <Select
                  value={createForm.tenantUniqueId || '__none__'}
                  onValueChange={(value) => updateCreateForm('tenantUniqueId', value === '__none__' ? '' : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select tenant" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No tenant assignment</SelectItem>
                    {tenants.map((tenant) => (
                      <SelectItem key={tenant.uniqueId} value={tenant.uniqueId}>
                        {tenant.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field
                label="Warehouse"
                hint={needsAssignmentScope(createForm.roleName) ? 'Optional if tenant-only access is enough, otherwise connect a specific warehouse.' : 'Optional for this role.'}
              >
                <Select
                  value={createForm.warehouseUniqueId || '__none__'}
                  onValueChange={(value) => {
                    const warehouseUniqueId = value === '__none__' ? '' : value
                    const warehouse = warehouses.find((item) => item.uniqueId === warehouseUniqueId)
                    const tenant = tenants.find((item) => item.id === warehouse?.tenantId)

                    setCreateForm((current) => ({
                      ...current,
                      warehouseUniqueId,
                      tenantUniqueId: warehouse ? tenant?.uniqueId ?? current.tenantUniqueId : current.tenantUniqueId,
                    }))
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select warehouse" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No warehouse assignment</SelectItem>
                    {filteredWarehouses.map((warehouse) => (
                      <SelectItem key={warehouse.uniqueId} value={warehouse.uniqueId}>
                        {warehouse.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="space-y-4 rounded-xl border p-4" style={{ borderColor: 'var(--admin-panel-border)', background: 'var(--admin-panel-subtle-bg)' }}>
              <div>
                <div className="text-sm font-semibold text-text-primary">Role and access summary</div>
                <p className="mt-1 text-xs leading-5 text-text-tertiary">{selectedCreateRole?.description || ROLE_HINTS[createForm.roleName]}</p>
              </div>

              <div className="rounded-lg border px-3 py-3" style={{ borderColor: 'var(--admin-row-border)', background: 'var(--admin-panel-bg)' }}>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-text-tertiary">Access scope</div>
                <div className="mt-2 space-y-2 text-sm text-text-secondary">
                  <div>
                    <span className="font-medium text-text-primary">Tenant:</span> {selectedTenant?.name ?? 'Not assigned'}
                  </div>
                  <div>
                    <span className="font-medium text-text-primary">Warehouse:</span>{' '}
                    {warehouses.find((warehouse) => warehouse.uniqueId === createForm.warehouseUniqueId)?.name ?? 'Not assigned'}
                  </div>
                  <div>
                    <span className="font-medium text-text-primary">Verification:</span> Created as verified by admin
                  </div>
                </div>
              </div>

              <div className="rounded-lg border px-3 py-3 text-xs leading-5 text-text-secondary" style={{ borderColor: 'var(--admin-row-border)', background: 'var(--admin-panel-bg)' }}>
                {needsAssignmentScope(createForm.roleName)
                  ? 'This role should usually be linked to a tenant or warehouse so access stays scoped correctly.'
                  : 'This role can operate without a tenant or warehouse assignment when broader system visibility is required.'}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateDialogOpen(false)} disabled={createUserMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={handleCreateUserSubmit} disabled={createUserMutation.isPending}>
              {createUserMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create user
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open)
          if (!open && !updateUserMutation.isPending && !deactivateUserMutation.isPending) {
            setEditForm(null)
            setResetPassword('')
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit user</DialogTitle>
            <DialogDescription>
              Update profile details, change access scope, reset credentials, or deactivate the account.
            </DialogDescription>
          </DialogHeader>

          {editForm ? (
            <div className="grid gap-6 md:grid-cols-[1.4fr_0.95fr]">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Username">
                  <Input value={editForm.username} onChange={(event) => updateEditForm('username', event.target.value)} />
                </Field>

                <Field label="Email">
                  <Input type="email" value={editForm.email} onChange={(event) => updateEditForm('email', event.target.value)} />
                </Field>

                <Field label="First name">
                  <Input value={editForm.firstName} onChange={(event) => updateEditForm('firstName', event.target.value)} />
                </Field>

                <Field label="Last name">
                  <Input value={editForm.lastName} onChange={(event) => updateEditForm('lastName', event.target.value)} />
                </Field>

                <Field label="Phone number">
                  <Input value={editForm.phoneNumber} onChange={(event) => updateEditForm('phoneNumber', event.target.value)} />
                </Field>

                <Field label="Verified account" hint="Admins can keep trusted accounts verified.">
                  <div className="flex h-9 items-center justify-between rounded-lg border px-3" style={{ borderColor: 'var(--admin-row-border)' }}>
                    <span className="text-sm text-text-secondary">{editForm.hasBeenVerified ? 'Verified' : 'Pending verification'}</span>
                    <Switch checked={editForm.hasBeenVerified} onCheckedChange={(checked) => updateEditForm('hasBeenVerified', checked)} />
                  </div>
                </Field>

                <Field label="Role">
                  <Select value={editForm.roleName} onValueChange={handleEditRoleChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      {roleOptions.map((role) => (
                        <SelectItem key={role.uniqueId} value={role.name}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="Tenant">
                  <Select
                    value={editForm.tenantUniqueId || '__none__'}
                    onValueChange={(value) => updateEditForm('tenantUniqueId', value === '__none__' ? '' : value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select tenant" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No tenant assignment</SelectItem>
                      {tenants.map((tenant) => (
                        <SelectItem key={tenant.uniqueId} value={tenant.uniqueId}>
                          {tenant.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="Warehouse">
                  <Select
                    value={editForm.warehouseUniqueId || '__none__'}
                    onValueChange={(value) => {
                      const warehouseUniqueId = value === '__none__' ? '' : value
                      const warehouse = warehouses.find((item) => item.uniqueId === warehouseUniqueId)
                      const tenant = tenants.find((item) => item.id === warehouse?.tenantId)
                      setEditForm((current) => current ? {
                        ...current,
                        warehouseUniqueId,
                        tenantUniqueId: warehouse ? tenant?.uniqueId ?? current.tenantUniqueId : current.tenantUniqueId,
                      } : current)
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select warehouse" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No warehouse assignment</SelectItem>
                      {filteredEditWarehouses.map((warehouse) => (
                        <SelectItem key={warehouse.uniqueId} value={warehouse.uniqueId}>
                          {warehouse.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <div className="space-y-4 rounded-xl border p-4" style={{ borderColor: 'var(--admin-panel-border)', background: 'var(--admin-panel-subtle-bg)' }}>
                <div>
                  <div className="text-sm font-semibold text-text-primary">Access summary</div>
                  <p className="mt-1 text-xs leading-5 text-text-tertiary">
                    {roleOptions.find((role) => role.name === editForm.roleName)?.description || ROLE_HINTS[editForm.roleName]}
                  </p>
                </div>

                <div className="rounded-lg border p-3" style={{ borderColor: 'var(--admin-row-border)', background: 'var(--admin-panel-bg)' }}>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-text-tertiary">Current scope</div>
                  <div className="mt-2 space-y-2 text-sm text-text-secondary">
                    <div><span className="font-medium text-text-primary">Tenant:</span> {selectedEditTenant?.name ?? 'Not assigned'}</div>
                    <div><span className="font-medium text-text-primary">Warehouse:</span> {warehouses.find((warehouse) => warehouse.uniqueId === editForm.warehouseUniqueId)?.name ?? 'Not assigned'}</div>
                  </div>
                </div>

                <div className="rounded-lg border p-3" style={{ borderColor: 'var(--admin-row-border)', background: 'var(--admin-panel-bg)' }}>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-text-tertiary">Reset password</div>
                  <div className="space-y-3">
                    <Input type="password" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} placeholder="Set temporary password" />
                    <Button variant="secondary" onClick={handleResetPasswordSubmit} disabled={resetPasswordMutation.isPending}>
                      {resetPasswordMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Reset password
                    </Button>
                  </div>
                </div>

                <div className="rounded-lg border p-3" style={{ borderColor: 'var(--error)', background: 'var(--admin-panel-bg)' }}>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--error)' }}>Danger zone</div>
                  <p className="mb-3 text-xs text-text-secondary">Deactivate removes active access and keeps the record for audit history.</p>
                  <Button variant="destructive" onClick={handleDeactivateUser} disabled={deactivateUserMutation.isPending || editForm.username === sessionUser?.userName}>
                    {deactivateUserMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Deactivate user
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditDialogOpen(false)} disabled={updateUserMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={handleUpdateUserSubmit} disabled={!editForm || updateUserMutation.isPending}>
              {updateUserMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={roleDialogOpen}
        onOpenChange={(open) => {
          setRoleDialogOpen(open)
          if (!open && !assignRoleMutation.isPending) {
            setSelectedUser(null)
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Change user role</DialogTitle>
            <DialogDescription>
              Update the role assignment for {selectedUser ? `${selectedUser.firstName || selectedUser.username}` : 'this user'}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Field label="Assigned role" hint="Changing the role updates the permission bundle attached to this account.">
              <Select value={selectedRoleName} onValueChange={(value) => setSelectedRoleName(value as UserRole)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((role) => (
                    <SelectItem key={role.uniqueId} value={role.name}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="rounded-lg border px-3 py-3 text-sm text-text-secondary" style={{ borderColor: 'var(--admin-row-border)', background: 'var(--admin-panel-subtle-bg)' }}>
              {roleOptions.find((role) => role.name === selectedRoleName)?.description || ROLE_HINTS[selectedRoleName]}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setRoleDialogOpen(false)} disabled={assignRoleMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={handleAssignRoleSubmit} disabled={assignRoleMutation.isPending || !selectedUser}>
              {assignRoleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Save role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!isLoading && totalPages > 1 && (
        <div className="flex shrink-0 items-center justify-between rounded-xl px-4 py-3" style={{ background: 'var(--admin-panel-bg)', border: '1px solid var(--admin-panel-border)', boxShadow: 'var(--shadow-sm)' }}>
          <span className="text-xs text-text-tertiary">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} users
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page === 1}
              className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors disabled:opacity-30"
              style={{ background: 'var(--admin-button-bg)' }}
            >
              <ChevronLeft className="h-4 w-4 text-text-secondary" />
            </button>
            {Array.from({ length: totalPages }).map((_, index) => (
              <button
                key={index}
                onClick={() => setPage(index + 1)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold transition-colors"
                style={{
                  background: page === index + 1 ? 'var(--admin-page-active-bg)' : 'var(--admin-button-bg)',
                  color: page === index + 1 ? 'var(--admin-page-active-text)' : 'var(--text-secondary)',
                }}
              >
                {index + 1}
              </button>
            ))}
            <button
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
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
