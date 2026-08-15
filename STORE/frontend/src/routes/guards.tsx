import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

import { useAuth } from '@/context/auth-context';

export function ProtectedRoute({ children }: { children: ReactNode }): JSX.Element {
  const { accessToken } = useAuth();
  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export function RoleGuard({ roles, children }: { roles: Array<'OWNER' | 'MANAGER' | 'WORKER' | 'SUPER_ADMIN'>; children: ReactNode }): JSX.Element {
  const { user } = useAuth();
  if (!user?.role || !roles.includes(user.role)) {
    return <Navigate to="/403" replace />;
  }
  return <>{children}</>;
}
