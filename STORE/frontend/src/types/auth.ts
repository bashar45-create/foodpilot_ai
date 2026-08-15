export interface AuthUser {
  userId: string;
  businessId?: string;
  role?: 'OWNER' | 'MANAGER' | 'WORKER' | 'SUPER_ADMIN';
  assignedStore?: string | null;
  username?: string;
  email?: string;
  name?: string;
}
