import { apiClient } from '@/api/client';

export interface Ticket {
  id: string;
  businessId?: string;
  storeId?: string | null;
  title: string;
  description?: string | null;
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' | string;
  status?: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | string;
  createdBy?: string | null;
  assignedTo?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateTicketRequest {
  title: string;
  description?: string;
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  storeId?: string | null;
}

export async function listTickets(): Promise<Ticket[]> {
  return apiClient.get('/api/v1/tickets');
}

export async function createTicket(input: CreateTicketRequest): Promise<Ticket> {
  return apiClient.post('/api/v1/tickets', input);
}