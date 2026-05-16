// ============================================
// GitHub disclaimer utility tests
// ============================================
import { describe, expect, it } from 'vitest';
import {
  PERSONAL_IDE_DISCLAIMER,
  ensurePersonalIdeDisclaimer,
  hasPersonalIdeDisclaimer,
} from '../../apps/server/src/services/github/disclaimer';

describe('GitHub disclaimer utility', () => {
  it('appends disclaimer when missing', () => {
    const body = 'Status update from the pipeline.';
    const out = ensurePersonalIdeDisclaimer(body);
    expect(out).toContain(body);
    expect(out).toContain(PERSONAL_IDE_DISCLAIMER);
  });

  it('is idempotent when disclaimer already exists', () => {
    const body = `Status update.${PERSONAL_IDE_DISCLAIMER}`;
    const out = ensurePersonalIdeDisclaimer(body);
    const count = out.split('Sent from a [Personal_IDE]').length - 1;
    expect(count).toBe(1);
  });

  it('recognizes disclaimer variants that should not be duplicated', () => {
    const body = 'Done.\n\nSent from a [Personal_IDE](https://github.com/Ileices/personal_IDE)';
    expect(hasPersonalIdeDisclaimer(body)).toBe(true);
    expect(ensurePersonalIdeDisclaimer(body)).toBe(body);
  });
});
