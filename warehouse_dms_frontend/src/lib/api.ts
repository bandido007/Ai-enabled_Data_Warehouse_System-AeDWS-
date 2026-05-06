import axios from 'axios'

import { useToastStore } from '@/hooks/use-toast'
import i18n from '@/i18n'
import { authStore } from '@/stores/auth-store'
import { apiStatusStore } from '@/stores/api-status-store'
import type { ApiEnvelope, ItemResponse, PaginatedResponse } from '@/types/api'

const apiBaseUrl = import.meta.env.VITE_API_URL || '/api/v1'

// Media files are served from the API origin (e.g. http://localhost:8001).
// The backend returns relative paths like /media/documents/file.pdf.
// This helper converts them to full URLs so the viewer can fetch them.
const _apiOrigin = (() => {
  try { return new URL(apiBaseUrl, window.location.href).origin } catch { return '' }
})()

export function resolveFileUrl(url?: string | null): string | null {
  if (!url) return null
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  return `${_apiOrigin}${url.startsWith('/') ? '' : '/'}${url}`
}

export const api = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const token = authStore.getState().accessToken

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

api.interceptors.response.use(
  (response) => {
    apiStatusStore.getState().markReachable()
    return response
  },
  (error) => {
    if (!error.response) {
      apiStatusStore.getState().markUnreachable(error.message || 'Network error')
      useToastStore.getState().push({
        title: i18n.t('errors.connectionToast.title'),
        description: i18n.t('errors.connectionToast.description'),
        variant: 'destructive',
      })
    } else if (error.response.status >= 500) {
      apiStatusStore.getState().markUnreachable(`HTTP ${error.response.status}`)
      useToastStore.getState().push({
        title: i18n.t('errors.serverToast.title'),
        description: i18n.t('errors.serverToast.description'),
        variant: 'destructive',
      })
    }

    return Promise.reject(error)
  }
)

export function assertSuccess<T extends ApiEnvelope>(payload: T) {
  if (!payload.response?.status) {
    throw new Error(payload.response?.message || 'Request failed')
  }

  return payload
}

export async function getItem<T>(url: string, params?: Record<string, unknown>) {
  const { data } = await api.get<ItemResponse<T>>(url, { params })
  return assertSuccess(data).data ?? null
}

export async function getList<T>(url: string, params?: Record<string, unknown>) {
  const { data } = await api.get<PaginatedResponse<T>>(url, { params })
  return assertSuccess(data)
}

export async function postItem<T>(url: string, body?: unknown) {
  const { data } = await api.post<ItemResponse<T>>(url, body)
  return assertSuccess(data).data ?? null
}

export async function postEnvelope(url: string, body?: unknown) {
  const { data } = await api.post<ApiEnvelope>(url, body)
  return assertSuccess(data)
}

export async function putEnvelope<T>(url: string, body: unknown) {
  const { data } = await api.put<ItemResponse<T>>(url, body)
  return assertSuccess(data).data ?? null
}

export async function deleteEnvelope(url: string) {
  const { data } = await api.delete<ApiEnvelope>(url)
  return assertSuccess(data)
}

export async function getDocumentStats() {
  const { data } = await api.get<ItemResponse<import('@/types/api').DocumentStats>>('/documents/stats/')
  return assertSuccess(data).data ?? null
}
