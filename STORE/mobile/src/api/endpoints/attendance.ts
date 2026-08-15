import { apiClient } from '@/api/client';

export type AttendanceStatus = 'PRESENT' | 'LATE' | 'ABSENT' | 'LEAVE';

export interface AttendanceRecord {
  id: string;
  userId: string;
  businessId?: string;
  storeId?: string | null;
  date: string;
  status: AttendanceStatus;
  clockIn?: string | null;
  clockOut?: string | null;
  note?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export async function getAttendanceToday(): Promise<AttendanceRecord> {
  return apiClient.get('/api/v1/attendance/today');
}

export async function clockIn(payload: { storeId?: string | null } = {}): Promise<AttendanceRecord> {
  return apiClient.post('/api/v1/attendance/clock-in', payload);
}

export async function clockOut(): Promise<AttendanceRecord> {
  return apiClient.post('/api/v1/attendance/clock-out', {});
}