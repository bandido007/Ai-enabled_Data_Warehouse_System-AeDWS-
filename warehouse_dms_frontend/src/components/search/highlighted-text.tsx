import type { ReactNode } from 'react'

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function HighlightedText({ text, query }: { text: string; query: string }) {
  const normalizedText = text || '—'
  const tokens = Array.from(
    new Set(
      query
        .trim()
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2)
    )
  )

  if (!tokens.length) {
    return <>{normalizedText}</>
  }

  const parts = normalizedText.split(new RegExp(`(${tokens.map(escapeRegExp).join('|')})`, 'gi'))
  const tokenSet = new Set(tokens.map((token) => token.toLowerCase()))

  return (
    <>
      {parts.map((part, index): ReactNode =>
        tokenSet.has(part.toLowerCase()) ? (
          <mark key={`${part}-${index}`} className="rounded bg-brand-teal/10 px-0.5 text-inherit">
            {part}
          </mark>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        )
      )}
    </>
  )
}
