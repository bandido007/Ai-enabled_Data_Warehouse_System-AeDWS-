import type { DocumentTypeMetadata } from '@/types/api'

export const ALL_DOCUMENT_CATEGORIES = 'all'

export function getDocumentTypeCategories(types: DocumentTypeMetadata[]) {
  return Array.from(new Set(types.map((type) => type.category).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  )
}

export function getDocumentTypesForCategory(types: DocumentTypeMetadata[], category: string) {
  if (!category || category === ALL_DOCUMENT_CATEGORIES) return types
  return types.filter((type) => type.category === category)
}

