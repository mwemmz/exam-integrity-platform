const BASE = import.meta.env.VITE_API_BASE_URL || '';

// The session token lives in sessionStorage, which is scoped to a single browser tab.
// That lets one tab be signed in as a student while another tab is signed in as a lecturer
// (localStorage is shared by every tab, so a second login used to overwrite the first).
const TOKEN_KEY = 'eip_token';

export function getToken(): string | null {
    try {
        return sessionStorage.getItem(TOKEN_KEY);
    } catch {
        return null;
    }
}

export function setToken(token: string | null) {
    try {
        // Remove the legacy shared key so an old login can never leak into new tabs.
        localStorage.removeItem(TOKEN_KEY);
    } catch { /* storage unavailable */ }
    try {
        if (token) sessionStorage.setItem(TOKEN_KEY, token);
        else sessionStorage.removeItem(TOKEN_KEY);
    } catch { /* storage unavailable */ }
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

// Fired when a request fails because the session token itself is missing or invalid
// (expired after its 1-hour lifetime, tampered, or signed before a server restart) —
// as opposed to an ordinary 401/403 an endpoint raises for its own reasons (wrong
// password, "not your exam", wrong role). The auth middleware is the only thing that
// replies with a `message` field; every application-level check below it replies with
// an `error` field instead, so that difference is what tells the two apart here.
export const SESSION_EXPIRED_EVENT = 'eip:session-expired';

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

    if (!res.ok) {
        if (token && (res.status === 401 || res.status === 403) && typeof data?.message === 'string') {
            setToken(null);
            try { sessionStorage.setItem('eip_session_expired', '1'); } catch { /* storage unavailable */ }
            window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
        }
        throw new ApiError(res.status, data);
    }
    return data as T;
}

export function fileUrl(path?: string | null): string {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return `${BASE}${path}`;
}
