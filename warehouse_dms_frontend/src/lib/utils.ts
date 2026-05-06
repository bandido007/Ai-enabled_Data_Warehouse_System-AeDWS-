import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function formatDisplayDate(value?: string | null, locale = 'en') {
  if (!value) {
    return '—'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat(locale === 'sw' ? 'sw-TZ' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Africa/Nairobi',
  }).format(date)
}

export function formatShortDate(value?: string | null, locale = 'en') {
  if (!value) {
    return '—'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat(locale === 'sw' ? 'sw-TZ' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    timeZone: 'Africa/Nairobi',
  }).format(date)
}

export function formatPercent(value?: number | null) {
  if (value === null || value === undefined) {
    return '—'
  }

  return `${Math.round(value * 100)}%`
}

export function startCase(value: string) {
  return value
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function prettifyFieldLabel(value: string) {
  return startCase(value.replace(/[.]/g, ' ').replace(/\[(\d+)\]/g, ' $1 '))
}

export function formatRelativeTime(value?: string | null, locale = 'en') {
  if (!value) {
    return '—'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  // Both date and Date.now() are UTC epoch ms — timezone is irrelevant for diff calculation
  const diffMs = date.getTime() - Date.now()
  const absMs = Math.abs(diffMs)
  const rtf = new Intl.RelativeTimeFormat(locale === 'sw' ? 'sw-TZ' : 'en-GB', {
    numeric: 'auto',
  })

  if (absMs < hour) {
    return rtf.format(Math.round(diffMs / minute), 'minute')
  }

  if (absMs < day) {
    return rtf.format(Math.round(diffMs / hour), 'hour')
  }

  return rtf.format(Math.round(diffMs / day), 'day')
}

export function isToday(value?: string | null) {
  if (!value) {
    return false
  }

  const date = new Date(value)
  const today = new Date()

  return date.toDateString() === today.toDateString()
}
