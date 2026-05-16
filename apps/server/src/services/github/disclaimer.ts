// ============================================
// GitHub post disclaimer utilities
// Ensures outbound discussion/comment text carries Personal_IDE provenance.
// ============================================

export const PERSONAL_IDE_DISCLAIMER = '\n\n---\n*Sent from a [Personal_IDE](https://github.com/Ileices/personal_IDE)*';

// Accept minor stylistic differences to avoid double-appending.
const PERSONAL_IDE_DISCLAIMER_RE = /sent\s+from\s+a\s+\[?personal(?:_|\\_)?ide\]?\s*\(https:\/\/github\.com\/Ileices\/personal_IDE\)/i;

export function hasPersonalIdeDisclaimer(text: string): boolean {
  return PERSONAL_IDE_DISCLAIMER_RE.test(String(text || ''));
}

export function ensurePersonalIdeDisclaimer(body: string): string {
  const text = typeof body === 'string' ? body : String(body ?? '');
  if (hasPersonalIdeDisclaimer(text)) return text;
  return text + PERSONAL_IDE_DISCLAIMER;
}
