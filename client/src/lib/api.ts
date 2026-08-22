const BASE = import.meta.env.VITE_API_BASE_URL || '';

export function getToken(): string | null {
    return localStorage.getItem('eip_token');
}

export function setToken(token: string | null) {
    if (token) localStorage.setItem('eip_token', token);
    else localStorage.removeItem('eip_token');
}

export interface JwtPayload {
    userId: number;
    role: string;
}

export function getAuthUser(): JwtPayload | null {
    const token = getToken();
    if (!token) return null;
    try {
        const payload = token.split('.')[1];
        return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    } catch {
        return null;
    }
}

export class ApiError extends Error {
    status: number;
    data: any;
    constructor(status: number, data: any) {
        super((data && data.error) || `Request failed (${status})`);
        this.status = status;
        this.data = data;
    }
}

export async function api<T = any>(path: string, options: { method?: string; body?: any } = {}): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${BASE}${path}`, {
        method: options.method || 'GET',
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined
    });

    let data: any = {};
    try {
        data = await res.json();
    } catch {
        data = {};
    }

    if (!res.ok) throw new ApiError(res.status, data);
    return data as T;
}

export function fileUrl(path?: string | null): string {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return `${BASE}${path}`;
}
