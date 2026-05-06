import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, ChevronLeft, ChevronRight, Loader2, MapPin, Plus, Search, ShieldCheck, Trash2 } from 'lucide-react'
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
import { useToast } from '@/hooks/use-toast'
import type { Region, Tenant, Warehouse } from '@/types/api'

interface WarehouseFormState {
  uniqueId?: string
  name: string
  tenantUniqueId: string
  regionUniqueId: string
  address: string
  phoneNumber: string
  email: string
  capacity: string
  capacityUnit: string
  registrationNumber: string
}

const EMPTY_WAREHOUSE_FORM: WarehouseFormState = {
  name: '',
  tenantUniqueId: '',
  regionUniqueId: '',
  address: '',
  phoneNumber: '',
  email: '',
  capacity: '',
  capacityUnit: 'documents',
  registrationNumber: '',
}

const PAGE_SIZE = 6

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

function buildWarehouseForm(warehouse: Warehouse, tenants: Tenant[], regions: Region[]): WarehouseFormState {
  const tenant = tenants.find((item) => item.id === warehouse.tenantId)
  const region = regions.find((item) => item.id === warehouse.regionId)

  return {
    uniqueId: warehouse.uniqueId,
    name: warehouse.name,
    tenantUniqueId: tenant?.uniqueId ?? '',
    regionUniqueId: region?.uniqueId ?? '',
    address: warehouse.address ?? '',
    phoneNumber: warehouse.phoneNumber ?? '',
    email: warehouse.email ?? '',
    capacity: warehouse.capacity ? String(warehouse.capacity) : '',
    capacityUnit: warehouse.capacityUnit ?? 'documents',
    registrationNumber: warehouse.registrationNumber ?? '',
  }
}

export function WarehousesPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [form, setForm] = useState<WarehouseFormState>(EMPTY_WAREHOUSE_FORM)

  const { data: warehouses = [], isLoading } = useQuery({
    queryKey: ['admin-warehouses'],
    queryFn: () => getList<Warehouse>('/tenants/warehouses', { itemsPerPage: 200 }).then((response) => response.data ?? []),
  })

  const { data: tenants = [] } = useQuery({
    queryKey: ['admin-tenants'],
    queryFn: () => getList<Tenant>('/tenants/', { itemsPerPage: 200 }).then((response) => response.data ?? []),
  })

  const { data: regions = [] } = useQuery({
    queryKey: ['regions'],
    queryFn: () => getList<Region>('/tenants/regions', { itemsPerPage: 200 }).then((response) => response.data ?? []),
  })

  const filtered = useMemo(
    () => warehouses.filter((warehouse) => `${warehouse.name} ${warehouse.address ?? ''} ${warehouse.regionName ?? ''} ${warehouse.tenantName ?? ''}`.toLowerCase().includes(search.toLowerCase())),
    [search, warehouses],
  )

  useEffect(() => {
    setPage(1)
  }, [search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const createWarehouseMutation = useMutation({
    mutationFn: async (payload: WarehouseFormState) => {
      await postItem<Warehouse>('/tenants/warehouses', {
        name: payload.name.trim(),
        tenantUniqueId: payload.tenantUniqueId,
        regionUniqueId: payload.regionUniqueId || undefined,
        address: payload.address.trim(),
        phoneNumber: payload.phoneNumber.trim(),
        email: payload.email.trim(),
        capacity: Number(payload.capacity || 0),
        capacityUnit: payload.capacityUnit.trim(),
        registrationNumber: payload.registrationNumber.trim(),
      })
    },
    onSuccess: async () => {
      toast({ title: 'Warehouse created', description: 'The warehouse is ready for document operations.' })
      setCreateOpen(false)
      setForm(EMPTY_WAREHOUSE_FORM)
      await queryClient.invalidateQueries({ queryKey: ['admin-warehouses'] })
    },
    onError: (error) => {
      toast({ title: 'Unable to create warehouse', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' })
    },
  })

  const updateWarehouseMutation = useMutation({
    mutationFn: async (payload: WarehouseFormState) => {
      await putEnvelope<Warehouse>(`/tenants/warehouses/${payload.uniqueId}`, {
        name: payload.name.trim(),
        tenantUniqueId: payload.tenantUniqueId,
        regionUniqueId: payload.regionUniqueId || undefined,
        address: payload.address.trim(),
        phoneNumber: payload.phoneNumber.trim(),
        email: payload.email.trim(),
        capacity: Number(payload.capacity || 0),
        capacityUnit: payload.capacityUnit.trim(),
        registrationNumber: payload.registrationNumber.trim(),
      })
    },
    onSuccess: async () => {
      toast({ title: 'Warehouse updated', description: 'Warehouse details were saved successfully.' })
      setEditOpen(false)
      setForm(EMPTY_WAREHOUSE_FORM)
      await queryClient.invalidateQueries({ queryKey: ['admin-warehouses'] })
    },
    onError: (error) => {
      toast({ title: 'Unable to update warehouse', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' })
    },
  })

  const deleteWarehouseMutation = useMutation({
    mutationFn: async (uniqueId: string) => {
      await deleteEnvelope(`/tenants/warehouses/${uniqueId}`)
    },
    onSuccess: async () => {
      toast({ title: 'Warehouse deactivated', description: 'The warehouse was removed from active operations.' })
      setEditOpen(false)
      setForm(EMPTY_WAREHOUSE_FORM)
      await queryClient.invalidateQueries({ queryKey: ['admin-warehouses'] })
    },
    onError: (error) => {
      toast({ title: 'Unable to deactivate warehouse', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' })
    },
  })

  function updateForm<K extends keyof WarehouseFormState>(field: K, value: WarehouseFormState[K]) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function openEdit(warehouse: Warehouse) {
    setForm(buildWarehouseForm(warehouse, tenants, regions))
    setEditOpen(true)
  }

  async function submitCreate() {
    if (!form.name.trim() || !form.tenantUniqueId) {
      toast({ title: 'Warehouse details required', description: 'Enter a warehouse name and assign a tenant.', variant: 'destructive' })
      return
    }

    await createWarehouseMutation.mutateAsync(form)
  }

  async function submitEdit() {
    if (!form.uniqueId) {
      return
    }

    await updateWarehouseMutation.mutateAsync(form)
  }

  async function deactivateWarehouse() {
    if (!form.uniqueId) {
      return
    }

    await deleteWarehouseMutation.mutateAsync(form.uniqueId)
  }

  const activeCount = warehouses.length
  const verifiedCount = warehouses.filter((warehouse) => warehouse.isVerified).length

  return (
    <div className="flex flex-col gap-5 pb-6">
      <div className="flex shrink-0 items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Warehouses</h1>
          <p className="mt-0.5 text-sm text-text-tertiary">Manage storage locations, capacity, and tenant assignment.</p>
        </div>
        <Button onClick={() => { setForm(EMPTY_WAREHOUSE_FORM); setCreateOpen(true) }}>
          <Plus className="h-4 w-4" />
          Add warehouse
        </Button>
      </div>

      <div className="grid shrink-0 grid-cols-3 gap-4">
        <StatCard icon={<Building2 className="h-5 w-5" />} label="Total Warehouses" value={warehouses.length} accent="var(--info)" accentBg="var(--info-bg)" />
        <StatCard icon={<ShieldCheck className="h-5 w-5" />} label="Verified" value={verifiedCount} accent="var(--success)" accentBg="var(--success-bg)" />
        <StatCard icon={<MapPin className="h-5 w-5" />} label="Active" value={activeCount} accent="var(--warning)" accentBg="var(--warning-bg)" />
      </div>

      <div className="flex shrink-0 items-center gap-3 rounded-xl px-4 py-3" style={{ background: 'var(--admin-panel-subtle-bg)', border: '1px solid var(--admin-panel-border)', boxShadow: 'var(--shadow-sm)' }}>
        <Search className="h-4 w-4 text-text-tertiary" />
        <Input placeholder="Search warehouses…" value={search} onChange={(event) => setSearch(event.target.value)} className="h-7 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl" style={{ background: 'var(--admin-panel-bg)', border: '1px solid var(--admin-panel-border)', boxShadow: 'var(--shadow-sm)' }}>
        <div className="grid px-4 py-2.5 text-[11px] font-semibold uppercase tracking-widest" style={{ gridTemplateColumns: '1.3fr 1fr 1fr 1fr 120px', color: 'var(--text-tertiary)', borderBottom: '1px solid var(--admin-row-border)', background: 'var(--admin-panel-subtle-bg)' }}>
          <span>Warehouse</span>
          <span>Tenant</span>
          <span>Region</span>
          <span>Capacity</span>
          <span>Actions</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="grid items-center gap-4 px-4 py-3" style={{ gridTemplateColumns: '1.3fr 1fr 1fr 1fr 120px', borderBottom: '1px solid var(--admin-row-border)' }}>
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-16 rounded-md" />
            </div>
          )) : paged.map((warehouse, index) => (
            <div key={warehouse.id} className="grid items-center gap-4 px-4 py-3 text-sm" style={{ gridTemplateColumns: '1.3fr 1fr 1fr 1fr 120px', borderBottom: index < paged.length - 1 ? '1px solid var(--admin-row-border)' : 'none' }}>
              <div>
                <div className="font-medium text-text-primary">{warehouse.name}</div>
                <div className="text-xs text-text-tertiary">{warehouse.address || 'No address set'}</div>
              </div>
              <span className="text-text-secondary">{warehouse.tenantName || 'Unassigned'}</span>
              <span className="text-text-secondary">{warehouse.regionName || 'Unassigned'}</span>
              <div>
                <div className="text-text-secondary">{warehouse.capacity ? `${warehouse.capacity.toLocaleString()} ${warehouse.capacityUnit}` : '—'}</div>
                <div className="text-xs text-text-tertiary">{warehouse.registrationNumber || 'No registration'}</div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => openEdit(warehouse)}>Edit</Button>
            </div>
          ))}

          {!isLoading && paged.length === 0 ? <div className="py-20 text-center text-sm text-text-tertiary">No warehouses found</div> : null}
        </div>
      </div>

      {(createOpen || editOpen) && (
        <Dialog open={createOpen || editOpen} onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false)
            setEditOpen(false)
            setForm(EMPTY_WAREHOUSE_FORM)
          }
        }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{createOpen ? 'Add warehouse' : 'Edit warehouse'}</DialogTitle>
              <DialogDescription>Maintain warehouse scope, contact details, and storage capacity.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Warehouse name">
                <Input value={form.name} onChange={(event) => updateForm('name', event.target.value)} />
              </Field>
              <Field label="Registration number">
                <Input value={form.registrationNumber} onChange={(event) => updateForm('registrationNumber', event.target.value)} />
              </Field>
              <Field label="Tenant">
                <Select value={form.tenantUniqueId || '__none__'} onValueChange={(value) => updateForm('tenantUniqueId', value === '__none__' ? '' : value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select tenant" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No tenant</SelectItem>
                    {tenants.map((tenant) => (
                      <SelectItem key={tenant.uniqueId} value={tenant.uniqueId}>{tenant.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
              <Field label="Phone number">
                <Input value={form.phoneNumber} onChange={(event) => updateForm('phoneNumber', event.target.value)} />
              </Field>
              <Field label="Email">
                <Input type="email" value={form.email} onChange={(event) => updateForm('email', event.target.value)} />
              </Field>
              <Field label="Capacity">
                <Input type="number" min="0" value={form.capacity} onChange={(event) => updateForm('capacity', event.target.value)} />
              </Field>
              <Field label="Capacity unit" hint="Examples: documents, pallets, cartons.">
                <Input value={form.capacityUnit} onChange={(event) => updateForm('capacityUnit', event.target.value)} />
              </Field>
              <div className="md:col-span-2">
                <Field label="Address">
                  <Input value={form.address} onChange={(event) => updateForm('address', event.target.value)} />
                </Field>
              </div>
            </div>

            <DialogFooter>
              {!createOpen ? (
                <Button variant="destructive" onClick={deactivateWarehouse} disabled={deleteWarehouseMutation.isPending}>
                  {deleteWarehouseMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Deactivate
                </Button>
              ) : null}
              <Button variant="ghost" onClick={() => { setCreateOpen(false); setEditOpen(false); setForm(EMPTY_WAREHOUSE_FORM) }}>
                Cancel
              </Button>
              <Button onClick={createOpen ? submitCreate : submitEdit} disabled={createWarehouseMutation.isPending || updateWarehouseMutation.isPending}>
                {createWarehouseMutation.isPending || updateWarehouseMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {createOpen ? 'Create warehouse' : 'Save changes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {!isLoading && totalPages > 1 ? (
        <div className="flex shrink-0 items-center justify-between rounded-xl px-4 py-3" style={{ background: 'var(--admin-panel-bg)', border: '1px solid var(--admin-panel-border)', boxShadow: 'var(--shadow-sm)' }}>
          <span className="text-xs text-text-tertiary">Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} warehouses</span>
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
