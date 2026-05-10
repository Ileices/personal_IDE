**Comment 2: DOMPurify XSS and Prototype Pollution - 7 CVEs Consolidated**

---

This is the most complex fix: **7 separate XSS/prototype pollution CVEs** in DOMPurify, all addressed by upgrading to 3.4.0+.

**DOMPurify's Role in Our Stack**

DOMPurify is the HTML sanitizer used by Monaco Editor. When users:
- Render markdown code blocks in the chat
- View code suggestions with HTML formatting
- See error messages with formatted output

...Monaco uses DOMPurify to strip malicious scripts before rendering. Without it, a user could inject `<img src=x onerror="alert(document.cookie)">` and execute arbitrary JS in the IDE.

**The 7 Vulnerabilities (All <3.4.0)**

Each was a different bypass technique:

1. **GHSA-v2wj-7wpq-c8vv**: Generic XSS in sanitized output
2. **GHSA-cjmm-f4jc-qw8r**: ADD_ATTR predicate skips URI validation
3. **GHSA-cj63-jhhr-wcxv**: USE_PROFILES config allows event handlers via prototype pollution
4. **GHSA-39q2-94rc-95cp**: ADD_TAGS with function predicate bypasses FORBID_TAGS
5. **GHSA-crv5-9vww-q3g8**: SAFE_FOR_TEMPLATES flag + RETURN_DOM mode XSS bypass
6. **GHSA-v9jr-rg53-9pgp**: CUSTOM_ELEMENT_HANDLING fallback leads to prototype pollution → XSS
7. **GHSA-h8r8-wccr-v5f2**: Mutation-XSS via re-contextualization of sanitized nodes

All were **independent XSS vectors**. Attackers could use *any one* of them to inject code.

**How It Was Fixed**

Added pnpm override rule:
```json
"dompurify": ">=3.4.0"
```

DOMPurify 3.4.0 patches all seven in one release. The fixes:
- Stricter attribute URI validation
- Prototype pollution chain prevention
- Tag predicate function boundaries enforced
- SAFE_FOR_TEMPLATES mode hardened
- Mutation-XSS detection added

**Verification**

- Pre-fix: All 7 listed as MODERATE in `pnpm audit`
- Post-fix: All 7 cleared
- Build: Vite bundles successfully; web still renders markdown
- Impact: Zero source code changes needed (drop-in replacement)

**Risk Assessment**

**If unfixed**: An attacker could craft a malicious markdown response or code suggestion that, when rendered in the IDE, executes arbitrary JavaScript with access to user's LLM tokens or database.

**After fix**: DOMPurify 3.4.0 blocks all known bypass techniques. Future bypasses could still exist (as with any sanitizer), but the surface is significantly reduced.

---

**Confidence**: High. These are well-audited, widely-used library fixes from the DOMPurify team.

**Recommendation**: Monitor DOMPurify releases; upgrade promptly if new CVEs are published.
