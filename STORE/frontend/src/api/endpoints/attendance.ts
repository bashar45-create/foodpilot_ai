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

export interface AttendanceHistoryResponse {
  userId: string;
  start: string;
  end: string;
  records: AttendanceRecord[];
}

export async function getAttendanceToday(): Promise<AttendanceRecord | { status: 'ABSENT'; clockIn: null; clockOut: null }> {
  return apiClient.get('/api/v1/attendance/today');
}

export async function clockIn(payload: { storeId?: string | null } = {}): Promise<AttendanceRecord> {
  return apiClient.post('/api/v1/attendance/clock-in', payload);
}

export async function clockOut(): Promise<AttendanceRecord> {
  return apiClient.post('/api/v1/attendance/clock-out', {});
}

export async function getEmployeeAttendance(
  userId: string,
  range: { start?: string; end?: string } = {},
): Promise<AttendanceHistoryResponse> {
  const params = new URLSearchParams();
  if (range.start) params.set('start', range.start);
  if (range.end) params.set('end', range.end);
  const qs = params.toString();
  return apiClient.get(`/api/v1/attendance/employee/${userId}${qs ? `?${qs}` : ''}`);
}

export async function getAttendanceOverview(
  range: { start?: string; end?: string } = {},
): Promise<{ start: string; end: string; byUser: Record<string, AttendanceRecord[]> }> {
  const params = new URLSearchParams();
  if (range.start) params.set('start', range.start);
  if (range.end) params.set('end', range.end);
  const qs = params.toString();
  return apiClient.get(`/api/v1/attendance/overview${qs ? `?${qs}` : ''}`);
}

export async function markAttendanceStatus(payload: {
  userId: string;
  date: string;
  status: AttendanceStatus;
  storeId?: string | null;
  note?: string;
}): Promise<AttendanceRecord> {
  const { userId, ...body } = payload;
  return apiClient.post(`/api/v1/attendance/employee/${userId}/mark`, body);
}