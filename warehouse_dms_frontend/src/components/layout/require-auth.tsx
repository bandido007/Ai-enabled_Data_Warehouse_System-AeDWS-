import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '@/hooks/use-auth'
import type { UserRole } from '@/types/api'

export function RequireAuth({ roles }: { roles?: UserRole[] }) {
  const location = useLocation()
  const { isAuthenticated, primaryRole } = useAuth()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (roles?.length && primaryRole && !roles.includes(primaryRole)) {
    if (primaryRole === 'DEPOSITOR') {
      return <Navigate to="/depositor" replace />
    }

    if (primaryRole === 'REGULATOR') {
      return <Navigate to="/regulator" replace />
    }

    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
