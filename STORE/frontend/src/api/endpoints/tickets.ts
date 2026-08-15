import { apiClient } from '@/api/client';

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | string;
export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | string;

export interface TicketComment {
  text: string;
  authorId?: string | null;
  createdAt: string;
}

export interface Ticket {
  id: string;
  businessId?: string;
  title: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  raisedBy?: string | null;
  assignedTo?: string | null;
  comments?: TicketComment[];
  attachments?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface TicketCreateRequest {
  title: string;
  description: string;
  priority?: TicketPriority;
}

export async function fetchTickets(params?: { status?: string; assignedTo?: string }): Promise<Ticket[]> {
  return apiClient.get('/api/v1/tickets', { params });
}

export async function fetchTicket(id: string): Promise<Ticket> {
  return apiClient.get(`/api/v1/tickets/${id}`);
}

export async function setTicketStatus(id: string, status: TicketStatus): Promise<Ticket> {
  return apiClient.patch(`/api/v1/tickets/${id}/status`, { status });
}

export async function assignTicket(id: string, assignedTo: string | null): Promise<Ticket> {
  return apiClient.patch(`/api/v1/tickets/${id}/assign`, { assignedTo });
}

export async function addTicketComment(id: string, text: string): Promise<Ticket> {
  return apiClient.post(`/api/v1/tickets/${id}/comments`, { text });
}
