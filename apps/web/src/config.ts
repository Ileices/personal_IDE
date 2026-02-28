// ============================================
// Frontend Configuration
// Centralizes all environment-dependent values.
// Uses Vite env vars with sensible defaults.
// ============================================

/**
 * Base URL for backend API calls.
 *
 * In development the Vite proxy rewrites `/api` → the real server,
 * so an empty string works (fetch('/api/…')).
 *
 * Set VITE_API_URL in a .env file to override, e.g.:
 *   VITE_API_URL=http://192.168.1.50:3001
 */
export const API_BASE: string =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') ?? '';

/**
 * Convenience: full API prefix including the /api path segment.
 * Most fetch calls should use this.
 */
export const API = `${API_BASE}/api`;
