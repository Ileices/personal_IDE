// ============================================
// E2E Test Helpers — shared server URL + request utilities
// ============================================

/** Base URL for the running server. Override via TEST_SERVER_URL env var. */
export const SERVER = process.env.TEST_SERVER_URL || 'http://localhost:3001';

function jsonRequestInit(method: string, body?: Record<string, any>, headers?: Record<string, string>) {
  const baseHeaders: Record<string, string> = { Origin: 'http://localhost:5173', ...headers };
  if (body !== undefined) {
    baseHeaders['Content-Type'] = 'application/json';
  }

  return {
    method,
    headers: baseHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };
}

/** JSON POST helper */
export async function post(path: string, body?: Record<string, any>, headers?: Record<string, string>) {
  const res = await fetch(`${SERVER}${path}`, jsonRequestInit('POST', body, headers));
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json, headers: res.headers };
}

/** JSON GET helper */
export async function get(path: string, headers?: Record<string, string>) {
  const res = await fetch(`${SERVER}${path}`, {
    headers: { Origin: 'http://localhost:5173', ...headers },
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json, headers: res.headers };
}

/** JSON PUT helper */
export async function put(path: string, body?: Record<string, any>, headers?: Record<string, string>) {
  const res = await fetch(`${SERVER}${path}`, jsonRequestInit('PUT', body, headers));
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json, headers: res.headers };
}

/** JSON DELETE helper */
export async function del(path: string, body?: Record<string, any>, headers?: Record<string, string>) {
  const res = await fetch(`${SERVER}${path}`, jsonRequestInit('DELETE', body, headers));
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json, headers: res.headers };
}

/** Wait for the server to be reachable (up to timeoutMs) */
export async function waitForServer(timeoutMs = 10_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${SERVER}/api/health`);
      if (res.ok) return true;
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}
