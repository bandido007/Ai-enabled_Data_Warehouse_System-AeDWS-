import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, ChevronLeft, ChevronRight, Globe, Loader2, Plus, Search, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'

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
import { deleteEnvelope, getList, postItem, putEnvelope } from '@/lib/api'
import type { Region, Tenant } from '@/types/api'
import { useToast } from '@/hooks/use-toast'

interface TenantFormState {
  uniqueId?: string
  name: string
  registrationNumber: string
  phoneNumber: string
  email: string
  address: string
  regionUniqueId: string
  logoUrl: string
}

const EMPTY_TENANT_FORM: TenantFormState = {
  name: '',
  registrationNumber: '',
  phoneNumber: '',
  email: '',
  address: '',
  regionUniqueId: '',
  logoUrl: '',
}

const PAGE_SIZE = 8

function StatCard({ icon, label, value, accent, accentBg }: { icon: ReactNode; label: string; value: number | string; accent: string; accentBg: string }) {
  return (
    <div className="flex items-center gap-4 rounded-xl p-5" style={{ background: 'var(--admin-panel-bg)', border: '1px solid var(--admin-panel-border)', boxShadow: 'var(--shadow-sm)' }}>
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

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
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

function buildTenantForm(tenant: Tenant, regions: Region[]): TenantFormState {
  const region = regions.find((item) => item.id === tenant.regionId)
  return {
    uniqueId: tenant.uniqueId,
    name: tenant.name,
    registrationNumber: tenant.registrationNumber,
    phoneNumber: tenant.phoneNumber,
    email: tenant.email,
    address: tenant.address,
    regionUniqueId: region?.uniqueId ?? '',
    logoUrl: tenant.logoUrl,
  }
}

export function TenantsPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [form, setForm] = useState<TenantFormState>(EMPTY_TENANT_FORM)

  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ['admin-tenants'],
    queryFn: () => getList<Tenant>('/tenants/', { itemsPerPage: 200 }).then((response) => response.data ?? []),
  })

  const { data: regions = [] } = useQuery({
    queryKey: ['regions'],
    queryFn: () => getList<Region>('/tenants/regions', { itemsPerPage: 200 }).then((response) => response.data ?? []),
  })

  const filtered = useMemo(
    () => tenants.filter((tenant) => `${tenant.name} ${tenant.registrationNumber} ${tenant.regionName ?? ''}`.toLowerCase().includes(search.toLowerCase())),
    [search, tenants],
  )

  useEffect(() => {
    setPage(1)
  }, [search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const createTenantMutation = useMutation({
    mutationFn: async (payload: TenantFormState) => {
      await postItem<Tenant>('/tenants/', {
        name: payload.name.trim(),
        registrationNumber: payload.registrationNumber.trim(),
        phoneNumber: payload.phoneNumber.trim(),
        email: payload.email.trim(),
        address: payload.address.trim(),
        regionUniqueId: payload.regionUniqueId || undefined,
        logoUrl: payload.logoUrl.trim(),
      })
    },
    onSuccess: async () => {
      toast({ title: 'Tenant created', description: 'The tenant is now available for user and warehouse assignments.' })
      setCreateOpen(false)
      setForm(EMPTY_TENANT_FORM)
      await queryClient.invalidateQueries({ queryKey: ['admin-tenants'] })
    },
    onError: (error) => {
      toast({ title: 'Unable to create tenant', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' })
    },
  })

  const updateTenantMutation = useMutation({
    mutationFn: async (payload: TenantFormState) => {
      await putEnvelope<Tenant>(`/tenants/${payload.uniqueId}`, {
        name: payload.name.trim(),
        registrationNumber: payload.registrationNumber.trim(),
        phoneNumber: payload.phoneNumber.trim(),
        email: payload.email.trim(),
        address: payload.address.trim(),
        regionUniqueId: payload.regionUniqueId || undefined,
        logoUrl: payload.logoUrl.trim(),
      })
    },
    onSuccess: async () => {
      toast({ title: 'Tenant updated', description: 'Tenant details were saved successfully.' })
      setEditOpen(false)
      setForm(EMPTY_TENANT_FORM)
      await queryClient.invalidateQueries({ queryKey: ['admin-tenants'] })
    },
    onError: (error) => {
      toast({ title: 'Unable to update tenant', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' })
    },
  })

  const deleteTenantMutation = useMutation({
    mutationFn: async (uniqueId: string) => {
      await deleteEnvelope(`/tenants/${uniqueId}`)
    },
    onSuccess: async () => {
      toast({ title: 'Tenant deactivated', description: 'The tenant was removed from active operations.' })
      setEditOpen(false)
      setForm(EMPTY_TENANT_FORM)
      await queryClient.invalidateQueries({ queryKey: ['admin-tenants'] })
    },
    onError: (error) => {
      toast({ title: 'Unable to deactivate tenant', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' })
    },
  })

  function updateForm<K extends keyof TenantFormState>(field: K, value: TenantFormState[K]) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function openEdit(tenant: Tenant) {
    setForm(buildTenantForm(tenant, regions))
    setEditOpen(true)
  }

  async function submitCreate() {
    if (!form.name.trim()) {
      toast({ title: 'Tenant name required', description: 'Enter a tenant name before saving.', variant: 'destructive' })
      return
    }

    await createTenantMutation.mutateAsync(form)
  }

  async function submitEdit() {
    if (!form.uniqueId) {
      return
    }
    await updateTenantMutation.mutateAsync(form)
  }

  async function deactivateTenant() {
    if (!form.uniqueId) {
      return
    }
    await deleteTenantMutation.mutateAsync(form.uniqueId)
  }

  const activeCount = tenants.length

  return (
    <div className="flex flex-col gap-5 pb-6">
      <div className="flex shrink-0 items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Tenants</h1>
          <p className="mt-0.5 text-sm text-text-tertiary">Register and maintain business organisations using the platform.</p>
        </div>
        <Button onClick={() => { setForm(EMPTY_TENANT_FORM); setCreateOpen(true) }}>
          <Plus className="h-4 w-4" />
          Add tenant
        </Button>
      </div>

      <div className="grid shrink-0 grid-cols-3 gap-4">
        <StatCard icon={<Building2 className="h-5 w-5" />} label="Total Tenants" value={tenants.length} accent="var(--info)" accentBg="var(--info-bg)" />
        <StatCard icon={<Globe className="h-5 w-5" />} label="Regions Covered" value={new Set(tenants.map((tenant) => tenant.regionName).filter(Boolean)).size} accent="var(--success)" accentBg="var(--success-bg)" />
        <StatCard icon={<Building2 className="h-5 w-5" />} label="Active" value={activeCount} accent="var(--warning)" accentBg="var(--warning-bg)" />
      </div>

      <div className="flex shrink-0 items-center gap-3 rounded-xl px-4 py-3" style={{ background: 'var(--admin-panel-subtle-bg)', border: '1px solid var(--admin-panel-border)', boxShadow: 'var(--shadow-sm)' }}>
        <Search className="h-4 w-4 text-text-tertiary" />
        <Input placeholder="Search tenants…" value={search} onChange={(event) => setSearch(event.target.value)} className="h-7 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl" style={{ background: 'var(--admin-panel-bg)', border: '1px solid var(--admin-panel-border)', boxShadow: 'var(--shadow-sm)' }}>
        <div className="grid px-4 py-2.5 text-[11px] font-semibold uppercase tracking-widest" style={{ gridTemplateColumns: '1.4fr 1fr 1fr 1.2fr 110px', color: 'var(--text-tertiary)', borderBottom: '1px solid var(--admin-row-border)', background: 'var(--admin-panel-subtle-bg)' }}>
          <span>Name</span>
          <span>Registration</span>
          <span>Region</span>
          <span>Contact</span>
          <span>Actions</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="grid items-center gap-4 px-4 py-3" style={{ gridTemplateColumns: '1.4fr 1fr 1fr 1.2fr 110px', borderBottom: '1px solid var(--admin-row-border)' }}>
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-8 w-16 rounded-md" />
            </div>
          )) : paged.map((tenant, index) => (
            <div key={tenant.id} className="grid items-center gap-4 px-4 py-3 text-sm" style={{ gridTemplateColumns: '1.4fr 1fr 1fr 1.2fr 110px', borderBottom: index < paged.length - 1 ? '1px solid var(--admin-row-border)' : 'none' }}>
              <div>
                <div className="font-medium text-text-primary">{tenant.name}</div>
                <div className="text-xs text-text-tertiary">{tenant.address || 'No address set'}</div>
              </div>
              <span className="text-text-secondary">{tenant.registrationNumber || '—'}</span>
              <span className="text-text-secondary">{tenant.regionName || 'Unassigned'}</span>
              <div>
                <div className="text-text-secondary">{tenant.email || '—'}</div>
                <div className="text-xs text-text-tertiary">{tenant.phoneNumber || '—'}</div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => openEdit(tenant)}>Edit</Button>
            </div>
          ))}

          {!isLoading && paged.length === 0 ? <div className="py-16 text-center text-sm text-text-tertiary">No tenants found</div> : null}
        </div>
      </div>

      {(createOpen || editOpen) && (
        <Dialog open={createOpen || editOpen} onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false)
            setEditOpen(false)
            setForm(EMPTY_TENANT_FORM)
          }
        }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{createOpen ? 'Add tenant' : 'Edit tenant'}</DialogTitle>
              <DialogDescription>Capture the organisation details that connect users and warehouses.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Tenant name">
                <Input value={form.name} onChange={(event) => updateForm('name', event.target.value)} />
              </Field>
              <Field label="Registration number">
                <Input value={form.registrationNumber} onChange={(event) => updateForm('registrationNumber', event.target.value)} />
              </Field>
              <Field label="Email">
                <Input type="email" value={form.email} onChange={(event) => updateForm('email', event.target.value)} />
              </Field>
              <Field label="Phone number">
                <Input value={form.phoneNumber} onChange={(event) => updateForm('phoneNumber', event.target.value)} />
              </Field>
              <Field label="Region">
                <Select value={form.regionUniqueId || '__none__'} onValueChange={(value) => updateForm('regionUniqueId', value === '__none__' ? '' : value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select region" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No region</SelectItem>
                    {regions.map((region) => (
                      <SelectItem key={region.uniqueId} value={region.uniqueId}>{region.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Logo URL" hint="Optional link for branding.">
                <Input value={form.logoUrl} onChange={(event) => updateForm('logoUrl', event.target.value)} />
              </Field>
              <div className="md:col-span-2">
                <Field label="Address">
                  <Input value={form.address} onChange={(event) => updateForm('address', event.target.value)} />
                </Field>
              </div>
            </div>

            <DialogFooter>
              {!createOpen ? (
                <Button variant="destructive" onClick={deactivateTenant} disabled={deleteTenantMutation.isPending}>
                  {deleteTenantMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Deactivate
                </Button>
              ) : null}
              <Button variant="ghost" onClick={() => { setCreateOpen(false); setEditOpen(false); setForm(EMPTY_TENANT_FORM) }}>
                Cancel
              </Button>
              <Button onClick={createOpen ? submitCreate : submitEdit} disabled={createTenantMutation.isPending || updateTenantMutation.isPending}>
                {createTenantMutation.isPending || updateTenantMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {createOpen ? 'Create tenant' : 'Save changes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {!isLoading && totalPages > 1 ? (
        <div className="flex shrink-0 items-center justify-between rounded-xl px-4 py-3" style={{ background: 'var(--admin-panel-bg)', border: '1px solid var(--admin-panel-border)', boxShadow: 'var(--shadow-sm)' }}>
          <span className="text-xs text-text-tertiary">Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} tenants</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1} className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors disabled:opacity-30" style={{ background: 'var(--admin-button-bg)' }}>
              <ChevronLeft className="h-4 w-4 text-text-secondary" />
            </button>
            {Array.from({ length: totalPages }).map((_, index) => (
              <button key={index} onClick={() => setPage(index + 1)} className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold transition-colors" style={{ background: page === index + 1 ? 'var(--admin-page-active-bg)' : 'var(--admin-button-bg)', color: page === index + 1 ? 'var(--admin-page-active-text)' : 'var(--text-secondary)' }}>
                {index + 1}
              </button>
            ))}
            <button onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages} className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors disabled:opacity-30" style={{ background: 'var(--admin-button-bg)' }}>
              <ChevronRight className="h-4 w-4 text-text-secondary" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
