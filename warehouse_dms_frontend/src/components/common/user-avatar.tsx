import { getInitials } from '@/lib/utils'

import { cn } from '@/lib/utils'

interface UserAvatarProps {
  user: {
    firstName?: string | null
    lastName?: string | null
    username?: string | null
  }
  size?: 'sm' | 'md'
}

export function UserAvatar({ user, size = 'md' }: UserAvatarProps) {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || 'User'

  return (
    <div
      className={cn(
        'inline-flex items-center justify-center rounded-full bg-brand-teal font-semibold text-surface',
        size === 'sm' ? 'h-7 w-7 text-xs' : 'h-9 w-9 text-sm'
      )}
      aria-label={name}
    >
      {getInitials(name)}
    </div>
  )
}
