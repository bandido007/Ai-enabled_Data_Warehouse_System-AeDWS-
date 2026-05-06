import type { AvailableTransition, DocumentRecord, WorkflowTransition } from '@/types/api'

import { prettifyFieldLabel } from './utils'

const correctionActions = new Set(['correct_ai', 'correct_fields'])

export function getAvailableTransitions(
  document: DocumentRecord | null | undefined,
  fallback?: AvailableTransition[] | null
) {
  return document?.availableTransitions?.length ? document.availableTransitions : fallback ?? []
}

export function getCorrectedFieldKeys(transitions: WorkflowTransition[]) {
  const corrected = new Set<string>()

  transitions.forEach((transition) => {
    if (!correctionActions.has(transition.action)) {
      return
    }

    Object.keys(transition.aiCorrections || {}).forEach((key) => corrected.add(key))
    Object.keys(transition.editedFields || {}).forEach((key) => corrected.add(key))
  })

  return corrected
}

export function getExtractedFieldEntries(fields: Record<string, unknown>) {
  return Object.entries(fields || {}).map(([key, value]) => ({
    key,
    label: prettifyFieldLabel(key),
    value: normalizeFieldValue(value),
  }))
}

export function normalizeFieldValue(value: unknown) {
  if (value === null || value === undefined) {
    return ''
  }

  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  return JSON.stringify(value)
}

export function getActionVariant(action: string) {
  if (action === 'reject') {
    return 'destructive' as const
  }

  if (action === 'send_back' || action === 'send_back_to_staff' || action === 'send_back_to_manager') {
    return 'secondary' as const
  }

  return 'primary' as const
}

export function getDocumentFileExtension(fileUrl?: string | null) {
  if (!fileUrl) {
    return ''
  }

  const cleanUrl = fileUrl.split('?')[0]
  return cleanUrl.split('.').pop()?.toLowerCase() ?? ''
}

export function isPdfDocument(fileUrl?: string | null) {
  return getDocumentFileExtension(fileUrl) === 'pdf'
}

export function isImageDocument(fileUrl?: string | null) {
  return ['jpg', 'jpeg', 'png', 'webp'].includes(getDocumentFileExtension(fileUrl))
}

export function getDisplayActorName(transition: WorkflowTransition) {
  const first = transition.actor?.firstName || ''
  const last = transition.actor?.lastName || ''
  const name = [first, last].filter(Boolean).join(' ')

  return name || transition.actor?.username || 'System'
}
