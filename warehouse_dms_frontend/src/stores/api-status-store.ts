import { create } from 'zustand'

interface ApiStatusState {
  reachable: boolean
  online: boolean
  message: string | null
  markReachable: () => void
  markUnreachable: (message?: string | null) => void
  setOnline: (online: boolean) => void
}

export const apiStatusStore = create<ApiStatusState>((set) => ({
  reachable: true,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  message: null,
  markReachable: () =>
    set({
      reachable: true,
      message: null,
    }),
  markUnreachable: (message) =>
    set({
      reachable: false,
      message: message ?? null,
    }),
  setOnline: (online) =>
    set((state) => ({
      online,
      reachable: online ? state.reachable : false,
      message: online ? state.message : null,
    })),
}))
