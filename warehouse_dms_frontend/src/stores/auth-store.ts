import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

import type { LoginResponse, RolePermissions, UserProfile, UserRole } from '@/types/api'

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  expiresAt: number | null
  user: LoginResponse['user']
  profile: UserProfile | null
  roles: RolePermissions[]
  setSession: (payload: LoginResponse) => void
  setProfile: (profile: UserProfile) => void
  clearSession: () => void
  permissionSet: () => Set<string>
  primaryRole: () => UserRole | null
}

export const authStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      user: null,
      profile: null,
      roles: [],
      setSession: (payload) =>
        set({
          accessToken: payload.access,
          refreshToken: payload.refresh,
          expiresAt: payload.expires,
          user: payload.user,
          roles: payload.roles,
        }),
      setProfile: (profile) => set({ profile }),
      clearSession: () =>
        set({
          accessToken: null,
          refreshToken: null,
          expiresAt: null,
          user: null,
          profile: null,
          roles: [],
        }),
      permissionSet: () => new Set(get().roles.flatMap((role) => role.permissions)),
      primaryRole: () => get().roles[0]?.roleName ?? (get().profile?.accountType ?? null),
    }),
    {
      name: 'warehouse-dms-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        expiresAt: state.expiresAt,
        user: state.user,
        profile: state.profile,
        roles: state.roles,
      }),
    }
  )
)
