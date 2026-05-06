import { useMemo } from 'react'

import { authStore } from '@/stores/auth-store'

export function useAuth() {
  const accessToken = authStore((state) => state.accessToken)
  const user = authStore((state) => state.user)
  const profile = authStore((state) => state.profile)
  const roles = authStore((state) => state.roles)
  const clearSession = authStore((state) => state.clearSession)

  const permissionSet = useMemo(() => new Set(roles.flatMap((role) => role.permissions)), [roles])
  const primaryRole = roles[0]?.roleName ?? profile?.accountType ?? null

  return {
    accessToken,
    isAuthenticated: Boolean(accessToken),
    user,
    profile,
    roles,
    permissionSet,
    primaryRole,
    clearSession,
  }
}
