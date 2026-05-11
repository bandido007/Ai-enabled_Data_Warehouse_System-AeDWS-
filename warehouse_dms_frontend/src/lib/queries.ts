import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, getDocumentStats, getItem, getList, postEnvelope, postItem, putEnvelope } from '@/lib/api'
import type {
  AnalyticsAggregates,
  AvailableTransition,
  DocumentRecord,
  DocumentTypeMetadata,
  LeaveApplication,
  LeaveBalance,
  LoginResponse,
  NotificationEvent,
  PreferenceItem,
  WarehouseRanking,
  SearchMode,
  SearchResponseData,
  UploadAttemptStart,
  UserProfile,
  Warehouse,
  WarehouseStatistics,
} from '@/types/api'

export function useProfileQuery(enabled: boolean) {
  return useQuery({
    queryKey: ['profile'],
    queryFn: () => getItem<UserProfile>('/accounts/me'),
    enabled,
  })
}

export function useDocumentTypesQuery(enabled = true) {
  return useQuery({
    queryKey: ['document-types'],
    queryFn: () => getItem<DocumentTypeMetadata[]>('/documents/types/'),
    enabled,
  })
}

export function useWarehousesQuery(enabled: boolean) {
  return useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => {
      const result = await getList<Warehouse>('/tenants/warehouses', { itemsPerPage: 100 })
      return result.data ?? []
    },
    enabled,
  })
}

export function useWarehouseStatisticsQuery(id: string | number | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['regulatory-warehouse-statistics', id],
    queryFn: () => getItem<WarehouseStatistics>(`/regulatory/warehouses/${id}/statistics/`),
    enabled: enabled && Boolean(id),
  })
}

export async function getWarehouseStatistics(id: string | number) {
  return getItem<WarehouseStatistics>(`/regulatory/warehouses/${id}/statistics/`)
}

export function useDocumentsQuery(params: Record<string, unknown>, enabled: boolean) {
  return useQuery({
    queryKey: ['documents', params],
    queryFn: () => getList<DocumentRecord>('/documents/', params),
    enabled,
  })
}

export function useDocumentQuery(id: string | undefined, enabled: boolean, pollUntilAiReady = false) {
  return useQuery({
    queryKey: ['document', id],
    queryFn: () => getItem<DocumentRecord>(`/documents/${id}/`),
    enabled: enabled && Boolean(id),
    refetchInterval: pollUntilAiReady
      ? (query) => {
          const doc = query.state.data as DocumentRecord | undefined
          return doc && !doc.aiSummary ? 5_000 : false
        }
      : false,
  })
}

export function useDocumentTransitionsQuery(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['document-transitions', id],
    queryFn: () => getItem<AvailableTransition[]>(`/documents/${id}/transitions/`),
    enabled: enabled && Boolean(id),
  })
}

export function useNotificationsQuery(enabled: boolean) {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const result = await getList<NotificationEvent>('/notifications/', {
        unreadOnly: true,
        itemsPerPage: 10,
      })
      return result.data ?? []
    },
    enabled,
    refetchInterval: 30_000,
  })
}

export function useDocumentSearchQuery(query: string, type: SearchMode, enabled: boolean) {
  return useQuery({
    queryKey: ['document-search', query, type],
    queryFn: () => searchDocuments({ query, type }),
    enabled: enabled && query.trim().length >= 2,
    staleTime: 30_000,
  })
}

export function useDocumentStatsQuery(enabled = true) {
  return useQuery({
    queryKey: ['document-stats'],
    queryFn: () => getDocumentStats(),
    enabled,
    refetchInterval: 60_000, // refresh every 60s
    staleTime: 30_000,
  })
}

export function useNotificationPreferencesQuery(enabled: boolean) {
  return useQuery({
    queryKey: ['notification-preferences'],
    queryFn: () => getItem<PreferenceItem[]>('/notifications/preferences/'),
    enabled,
  })
}

export async function searchDocuments(payload: { query: string; type?: SearchMode }) {
  const result = await postItem<SearchResponseData>('/documents/search/', payload)
  return result ?? { mode: payload.type ?? 'auto', detected: false, results: [] }
}

export async function loginRequest(payload: { username: string; password: string }) {
  const { data } = await api.post<LoginResponse>('/auth/login', payload)
  if (!data?.access) throw new Error('Invalid credentials')
  return data
}

export async function forgotPassword(email: string) {
  return postEnvelope('/accounts/forgot-password', { email })
}

export async function resetPassword(payload: { token: string; newPassword: string }) {
  return postEnvelope('/accounts/change-password', payload)
}

export async function changeOwnPassword(payload: { currentPassword: string; newPassword: string }) {
  return postEnvelope('/accounts/me/change-password', payload)
}

export async function markNotificationRead(notificationId: number) {
  return postEnvelope(`/notifications/${notificationId}/mark-read/`)
}

export async function markAllNotificationsRead() {
  return postEnvelope('/notifications/mark-all-read/')
}

export async function saveNotificationPreferences(preferences: PreferenceItem[]) {
  return putEnvelope<PreferenceItem[]>('/notifications/preferences/', { preferences })
}

export async function updatePreferredLanguage(payload: {
  uniqueId: string
  firstName: string
  lastName: string
  phoneNumber: string
  preferredLanguage: 'en' | 'sw'
}) {
  return putEnvelope<UserProfile>('/accounts/me', payload)
}

export async function submitDocumentTransition(
  documentId: string | number,
  payload: {
    action: string
    reason?: string
    editedFields?: Record<string, unknown>
    aiCorrections?: Record<string, unknown>
  }
) {
  return putOrPostTransition(documentId, payload)
}

/**
 * Resubmit a document that was returned for correction.
 * Sends action="resubmit" with the corrected field values as editedFields.
 */
export async function submitResubmit(
  documentId: number,
  editedFields: Record<string, unknown>
) {
  return putOrPostTransition(documentId, {
    action: 'resubmit',
    editedFields,
  })
}

async function putOrPostTransition(
  documentId: string | number,
  payload: {
    action: string
    reason?: string
    editedFields?: Record<string, unknown>
    aiCorrections?: Record<string, unknown>
  }
) {
  const { data } = await api.post(`/documents/${documentId}/transition/`, payload)
  if (!data?.response?.status) {
    throw new Error(data?.response?.message || 'Unable to transition document')
  }

  return data.data as DocumentRecord
}

export async function saveCorrectedFields(
  documentId: string | number,
  corrections: Record<string, unknown>,
  reason = ''
) {
  const endpoints = [`/documents/${documentId}/correct-fields/`, `/documents/${documentId}/correct-ai/`]
  let lastError: unknown = null

  for (const endpoint of endpoints) {
    try {
      const { data } = await api.post(endpoint, { corrections, reason })
      if (!data?.response?.status) {
        throw new Error(data?.response?.message || 'Unable to save correction')
      }

      return data.data as DocumentRecord
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Unable to save correction')
}

export async function reclassifyDocument(
  documentId: string | number,
  payload: { newTypeId: string; reason?: string }
) {
  const { data } = await api.post(`/documents/${documentId}/reclassify/`, payload)
  if (!data?.response?.status) {
    throw new Error(data?.response?.message || 'Unable to reclassify document')
  }

  const taskId = (data.data?.taskId as string | undefined) ?? (data.task_id as string | undefined)

  return {
    document: data.data as DocumentRecord,
    taskId,
  }
}

export async function getReclassifyStatus(documentId: string | number, taskId: string) {
  const { data } = await api.get(`/documents/${documentId}/reclassify-status/${taskId}/`)
  if (!data?.response?.status) {
    throw new Error(data?.response?.message || 'Unable to get reclassification status')
  }

  return data.data as { status?: string; state?: string; complete?: boolean }
}

export async function startUploadAttempt(payload: {
  file: File
  documentTypeId: string
  warehouseId: string | number
  title: string
}) {
  const formData = new FormData()
  formData.append('file', payload.file)
  formData.append('document_type_id', payload.documentTypeId)
  formData.append('warehouse_id', String(payload.warehouseId))
  formData.append('title', payload.title)

  const { data } = await api.post('/documents/upload/', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })

  if (!data?.response?.status) {
    throw new Error(data?.response?.message || 'Unable to start upload')
  }

  return data.data as UploadAttemptStart
}

export async function confirmUploadAttempt(attemptId: string | number, softWarningOverride = false) {
  const formData = new FormData()
  formData.append('soft_warning_override', softWarningOverride ? 'true' : 'false')

  const { data } = await api.post(`/documents/upload/${attemptId}/confirm/`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })

  if (!data?.response?.status) {
    throw new Error(data?.response?.message || 'Unable to confirm upload')
  }

  return data.data as DocumentRecord
}

export async function submitFormFill(payload: {
  documentTypeId: string
  warehouseId: number
  title: string
  fields: Record<string, string>
}) {
  const { data } = await api.post('/documents/form-fill/', {
    document_type_id: payload.documentTypeId,
    warehouse_id: payload.warehouseId,
    title: payload.title,
    fields: payload.fields,
  })

  if (!data?.response?.status) {
    throw new Error(data?.response?.message || 'Unable to submit form')
  }

  return data.data as DocumentRecord
}

// Form validation before submission
export interface FormValidationResult {
  confidence: number
  verdict: 'PASS' | 'SOFT_WARNING' | 'HARD_REJECT'
  issues: string[]
  recommendations: string[]
  warnings: string[]
}

export async function validateFormDraft(payload: {
  documentTypeId: string
  fields: Record<string, string>
}): Promise<FormValidationResult> {
  const { data } = await api.post('/documents/validate-form/', {
    document_type_id: payload.documentTypeId,
    fields: payload.fields,
  })

  if (!data?.response?.status) {
    throw new Error(data?.response?.message || 'Unable to validate form')
  }

  return data.data as FormValidationResult
}

// ── Reports / Ranking ─────────────────────────────────────────────────────────

export function useWarehouseRankingQuery(warehouseId: string | number | undefined, enabled = true) {
  return useQuery({
    queryKey: ['warehouse-ranking', warehouseId],
    queryFn: () => getItem<WarehouseRanking>(`/reports/warehouses/${warehouseId}/ranking/`),
    enabled: enabled && Boolean(warehouseId),
    staleTime: 5 * 60 * 1000, // 5 min – rankings are pre-computed, not live
  })
}

export function useRecomputeRankingMutation(warehouseId: string | number | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      postEnvelope(`/reports/warehouses/${warehouseId}/ranking/recompute/`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['warehouse-ranking', warehouseId] })
      qc.invalidateQueries({ queryKey: ['regulatory-warehouse-statistics', warehouseId] })
    },
  })
}

export function useAnalyticsAggregatesQuery(warehouseId?: string | number, enabled = true) {
  return useQuery({
    queryKey: ['analytics-aggregates', warehouseId],
    queryFn: () => {
      const params = warehouseId ? `?warehouse_id=${warehouseId}` : ''
      return getItem<AnalyticsAggregates>(`/reports/analytics/aggregates/${params}`)
    },
    enabled,
    staleTime: 2 * 60 * 1000, // 2 min
  })
}

// ── Leave ─────────────────────────────────────────────────────────────────────

export function useLeaveBalanceQuery(enabled = true) {
  return useQuery({
    queryKey: ['leave-balance'],
    queryFn: () => getItem<LeaveBalance>('/leave/balance/'),
    enabled,
    staleTime: 30_000,
  })
}

export function useLeaveApplicationsQuery(
  params: Record<string, unknown> = {},
  enabled = true,
) {
  return useQuery({
    queryKey: ['leave-applications', params],
    queryFn: () => getList<LeaveApplication>('/leave/applications/', params),
    enabled,
  })
}

export function useSubmitLeaveApplicationMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: {
      leaveType: string
      startDate: string
      endDate: string
      reason: string
    }) => postItem<LeaveApplication>('/leave/applications/', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave-applications'] })
      qc.invalidateQueries({ queryKey: ['leave-balance'] })
    },
  })
}

export function useLeaveTransitionMutation(applicationId: number | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { action: string; comment: string }) =>
      postItem<LeaveApplication>(`/leave/applications/${applicationId}/transition/`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave-applications'] })
      qc.invalidateQueries({ queryKey: ['leave-balance'] })
    },
  })
}

export function useCancelLeaveApplicationMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete(`/leave/applications/${id}/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave-applications'] })
      qc.invalidateQueries({ queryKey: ['leave-balance'] })
    },
  })
}
