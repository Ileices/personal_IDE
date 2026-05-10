// ============================================
// API Client - Base fetch wrapper
// ============================================

import { API } from '../config.js';

const API_BASE = API;
const CSRF_COOKIE = 'csrf_token';
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function buildUrl(path: string): string {
  const normalizedBase = API_BASE.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  // Avoid accidental /api/api/... when callers already include /api-prefixed paths.
  if (normalizedBase.endsWith('/api') && normalizedPath.startsWith('/api/')) {
    return `${normalizedBase}${normalizedPath.slice(4)}`;
  }

  if (normalizedBase.endsWith('/api') && normalizedPath === '/api') {
    return normalizedBase;
  }

  return `${normalizedBase}${normalizedPath}`;
}

function getCookie(name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

async function ensureCsrfToken(): Promise<string | null> {
  const existing = getCookie(CSRF_COOKIE);
  if (existing) return existing;

  // Bootstrap token cookie via a safe endpoint.
  await fetch(buildUrl('/health'), {
    method: 'GET',
    credentials: 'include',
  }).catch(() => {});

  return getCookie(CSRF_COOKIE);
}

function isUnsafeMethod(method: string): boolean {
  return UNSAFE_METHODS.has(method.toUpperCase());
}

async function doApiFetch(path: string, options?: RequestInit, retry = true): Promise<Response> {
  const method = (options?.method || 'GET').toUpperCase();
  const headers = new Headers(options?.headers || {});
  if (options?.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (isUnsafeMethod(method) && !headers.has('X-CSRF-Token')) {
    const token = await ensureCsrfToken();
    if (token) headers.set('X-CSRF-Token', token);
  }

  const res = await fetch(buildUrl(path), {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!res.ok && retry && isUnsafeMethod(method) && res.status === 403) {
    const payload = await res.clone().json().catch(() => ({} as any));
    const msg = String((payload as any)?.message || (payload as any)?.error || '');
    if (msg.toLowerCase().includes('csrf')) {
      const token = await ensureCsrfToken();
      if (token) {
        headers.set('X-CSRF-Token', token);
        return fetch(buildUrl(path), {
          ...options,
          headers,
          credentials: 'include',
        });
      }
    }
  }

  return res;
}

export async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await doApiFetch(path, options, true);

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || `API error: ${res.status}`);
  }

  return res.json();
}

export function apiGet<T>(path: string): Promise<T> {
  return apiFetch<T>(path);
}

export function apiPost<T>(path: string, body: any): Promise<T> {
  return apiFetch<T>(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function apiPut<T>(path: string, body: any): Promise<T> {
  return apiFetch<T>(path, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function apiDelete<T>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: 'DELETE' });
}

/**
 * SSE streaming fetch - returns a reader for Server-Sent Events
 */
export async function apiStream(
  path: string,
  body: any,
  onEvent: (event: any) => void,
  onError?: (error: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  const token = await ensureCsrfToken();
  if (token) headers.set('X-CSRF-Token', token);

  const res = await fetch(buildUrl(path), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
    credentials: 'include',
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    onError?.(error.error || `API error: ${res.status}`);
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Parse SSE events
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          onEvent(data);
        } catch {
          // Skip malformed events
        }
      }
    }
  }
}

/**
 * SSE GET stream (for agent events)
 */
export function apiStreamGet(
  path: string,
  onEvent: (event: any) => void,
  onError?: (error: string) => void
): EventSource {
  const es = new EventSource(buildUrl(path), { withCredentials: true });

  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      onEvent(data);
    } catch {
      // Skip
    }
  };

  es.onerror = () => {
    onError?.('Connection lost');
    es.close();
  };

  return es;
}
