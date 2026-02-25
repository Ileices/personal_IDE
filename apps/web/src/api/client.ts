// ============================================
// API Client - Base fetch wrapper
// ============================================

const API_BASE = '/api';

export async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

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
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
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
  const es = new EventSource(`${API_BASE}${path}`);

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
