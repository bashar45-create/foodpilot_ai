import { useAuth } from '@/context/AuthContext';

export function useAuthSession(): ReturnType<typeof useAuth> {
  return useAuth();
}
