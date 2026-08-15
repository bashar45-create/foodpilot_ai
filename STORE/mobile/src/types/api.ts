export interface ApiSuccess<T> {
  success: true;
  data: T;
  message?: string;
  meta?: { page: number; limit: number; total: number };
}

export interface ApiError {
  success: false;
  error: { code: string; message: string; details?: Record<string, unknown> };
}

export class ApiException extends Error {
  code: string;
  details?: Record<string, unknown>;

  constructor(message: string, code: string, details?: Record<string, unknown> | object) {
    super(message);
    this.name = 'ApiException';
    this.code = code;
    this.details = details as Record<string, unknown> | undefined;
  }
}
