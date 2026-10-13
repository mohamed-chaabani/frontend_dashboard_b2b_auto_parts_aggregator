import { clearToken, getToken } from './auth';

export type PlanId = 'tester' | 'starter' | 'pro' | 'enterprise';

export interface Plan {
  id: PlanId;
  label: string;
  months: number;
  price: number;
}

export interface User {
  id: string;
  name: string;
  username: string;
  phone: string;
  company: string;
  plan: PlanId;
  expiryDate: string;
  status: 'active' | 'expired';
  createdAt: string;
  updatedAt: string;
}

export interface Stats {
  total: number;
  active: number;
  expired: number;
  byPlan: Partial<Record<PlanId, number>>;
  revenueEstimated: number;
}

export interface UserPayload {
  name: string;
  username: string;
  phone: string;
  company?: string;
  plan: PlanId;
  expiryDate?: string;
  password?: string;
  resetPassword?: boolean;
}

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (res.status === 401 || res.status === 403) {
    clearToken();
    if (window.location.hash !== '#/login') {
      window.location.hash = '#/login';
    }
    throw new ApiError(res.status, 'Session expiree');
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const message =
      data && typeof data === 'object' && 'message' in data
        ? String((data as { message: unknown }).message)
        : `Erreur ${res.status}`;
    throw new ApiError(res.status, message);
  }

  return data as T;
}

export const api = {
  adminLogin: (email: string, password: string) =>
    request<{ token: string }>('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  plans: () => request<{ plans: Plan[] }>('/api/admin/plans'),

  stats: () => request<Stats>('/api/admin/stats'),

  users: (params: { status?: string; plan?: string; q?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status', params.status);
    if (params.plan) qs.set('plan', params.plan);
    if (params.q) qs.set('q', params.q);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<{ users: User[] }>(`/api/admin/users${suffix}`);
  },

  createUser: (payload: UserPayload) =>
    request<{ user: User }>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateUser: (id: string, payload: Partial<UserPayload>) =>
    request<{ user: User }>(`/api/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteUser: (id: string) =>
    request<{ id: string }>(`/api/admin/users/${id}`, { method: 'DELETE' }),
};
