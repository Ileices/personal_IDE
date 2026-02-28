// ============================================
// Code Sanitizer — cleans arbitrary code for
// safe integration. Detects non-code content,
// normalizes formatting, strips dangerous patterns.
// Ported from auto_rebuilder.py sanitize_code()
// + detect_non_code_files()
// ============================================

export interface SanitizeResult {
  code: string;
  isDocumentation: boolean;
  warnings: string[];
  language: string | null;
}

const MARKDOWN_HEADING = /^#{1,6}\s+.+$/m;
const MARKDOWN_BULLET = /^\s*[-*+]\s+.+$/m;
const HTML_TAG = /<\/?[a-z][\s\S]*?>/i;
const JSON_START = /^\s*[{[]/;
const EMOJI_PATTERN = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;

/**
 * Detect if content is documentation rather than executable code.
 */
export function isDocumentation(content: string): boolean {
  if (content.length < 50) return false;

  const lines = content.split('\n');
  let codeLines = 0;
  let textLines = 0;
  let markdownLines = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (MARKDOWN_HEADING.test(trimmed) || MARKDOWN_BULLET.test(trimmed)) {
      markdownLines++;
    } else if (
      trimmed.startsWith('import ') || trimmed.startsWith('from ') ||
      trimmed.startsWith('export ') || trimmed.startsWith('const ') ||
      trimmed.startsWith('function ') || trimmed.startsWith('class ') ||
      trimmed.startsWith('def ') || trimmed.startsWith('fn ') ||
      /[{};()]/.test(trimmed)
    ) {
      codeLines++;
    } else {
      textLines++;
    }
  }

  const total = codeLines + textLines + markdownLines;
  if (total === 0) return true;

  return (markdownLines + textLines) / total > 0.7;
}

/**
 * Sanitize a code string for safe integration.
 * Strips emojis, normalizes whitespace, detects non-code content.
 */
export function sanitizeCode(
  code: string,
  sourcePath = '',
): SanitizeResult {
  const warnings: string[] = [];

  // 1. Detect if this is documentation
  if (isDocumentation(code)) {
    return {
      code: `// Documentation file: ${sourcePath}\n// Content is non-executable\n`,
      isDocumentation: true,
      warnings: ['File detected as documentation, not code'],
      language: null,
    };
  }

  let result = code;

  // 2. Strip emojis (they break some parsers)
  const emojiCount = (result.match(EMOJI_PATTERN) || []).length;
  if (emojiCount > 0) {
    result = result.replace(EMOJI_PATTERN, '');
    warnings.push(`Stripped ${emojiCount} emoji characters`);
  }

  // 3. Normalize line endings
  result = result.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 4. Cap consecutive blank lines at 2
  result = result.replace(/\n{4,}/g, '\n\n\n');

  // 5. Normalize mixed tabs/spaces (prefer spaces)
  if (result.includes('\t') && result.includes('    ')) {
    result = result.replace(/\t/g, '    ');
    warnings.push('Normalized mixed tabs/spaces to 4-space indentation');
  }

  // 6. Detect language heuristically
  let language: string | null = null;
  if (/^import\s+\w|^from\s+\w.*import/m.test(result)) language = 'python';
  else if (/^import\s+{|^export\s+(default\s+)?/m.test(result)) language = 'typescript';
  else if (/^#include\s+[<"]/m.test(result)) language = 'cpp';
  else if (/^package\s+\w/m.test(result)) language = 'java';
  else if (/^use\s+\w|^fn\s+\w/m.test(result)) language = 'rust';

  return { code: result, isDocumentation: false, warnings, language };
}
