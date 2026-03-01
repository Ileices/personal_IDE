// ============================================
// Shared Code Constants — Single source of truth
// for language extensions, directory ignore lists,
// and extension-to-language mappings used across
// analysis, filesystem, and indexer services
// ============================================

/**
 * Language name → file extensions mapping.
 * Superset of all known code languages used by the analysis pipeline.
 */
export const LANG_EXTENSIONS: Record<string, string[]> = {
  typescript: ['.ts', '.tsx', '.mts', '.cts'],
  javascript: ['.js', '.jsx', '.mjs', '.cjs'],
  python: ['.py', '.pyi', '.pyw'],
  rust: ['.rs'],
  go: ['.go'],
  java: ['.java'],
  csharp: ['.cs'],
  cpp: ['.cpp', '.cc', '.cxx', '.hpp', '.hxx'],
  c: ['.c', '.h'],
  swift: ['.swift'],
  kotlin: ['.kt', '.kts'],
  ruby: ['.rb'],
  php: ['.php'],
  lua: ['.lua'],
  dart: ['.dart'],
  scala: ['.scala'],
  elixir: ['.ex', '.exs'],
  erlang: ['.erl'],
  haskell: ['.hs'],
  zig: ['.zig'],
  nim: ['.nim'],
  gdscript: ['.gd'],
  glsl: ['.glsl', '.vert', '.frag'],
  sql: ['.sql'],
  shell: ['.sh', '.bash', '.zsh'],
  powershell: ['.ps1', '.psm1'],
  r: ['.r'],
  julia: ['.jl'],
  html: ['.html'],
  css: ['.css'],
  scss: ['.scss'],
  less: ['.less'],
  svelte: ['.svelte'],
  vue: ['.vue'],
  astro: ['.astro'],
  json: ['.json'],
  yaml: ['.yaml', '.yml'],
  toml: ['.toml'],
  xml: ['.xml'],
  markdown: ['.md', '.mdx'],
  plaintext: ['.txt'],
  protobuf: ['.proto'],
  graphql: ['.graphql'],
  dockerfile: ['.dockerfile'],
  bat: ['.bat', '.cmd'],
};

/**
 * Extension → language name (derived from LANG_EXTENSIONS).
 * For filesystem display, use EXT_TO_LANG_DISPLAY which has
 * VS-Code-style display names like 'typescriptreact'.
 */
export const EXT_TO_LANG: Record<string, string> = {};
for (const [lang, exts] of Object.entries(LANG_EXTENSIONS)) {
  for (const ext of exts) EXT_TO_LANG[ext] = lang;
}

/**
 * Extension → VS-Code-style language ID (used for editor display).
 * Includes display-specific aliases like 'typescriptreact', 'shellscript'.
 */
export const EXT_TO_LANG_DISPLAY: Record<string, string> = {
  ...EXT_TO_LANG,
  '.tsx': 'typescriptreact',
  '.jsx': 'javascriptreact',
  '.sh': 'shellscript',
  '.bash': 'shellscript',
  '.zsh': 'shellscript',
};

/**
 * All known code extensions (for filtering files).
 */
export const CODE_EXTENSIONS = new Set<string>(Object.keys(EXT_TO_LANG));

/**
 * Directories to ignore when scanning project trees.
 * Superset of all ignore lists across services.
 */
export const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', '__pycache__',
  '.next', '.nuxt', 'dist', 'build', 'out', '.cache',
  'coverage', '.tox', '.mypy_cache', '.pytest_cache',
  'venv', '.venv', 'env', '.env',
  'target', '.idea', '.vs', '.vscode', '.ide-logs',
  '.turbo', '.output', 'vendor', 'bin', 'obj',
]);

/**
 * Files to ignore when listing (OS artifacts).
 */
export const IGNORED_FILES = new Set([
  '.DS_Store', 'Thumbs.db', 'desktop.ini',
]);

/**
 * Binary/non-code extensions to skip during indexing.
 */
export const IGNORE_EXTENSIONS = new Set([
  '.map', '.min.js', '.min.css', '.lock', '.png', '.jpg', '.gif', '.ico',
  '.woff', '.woff2', '.ttf', '.eot', '.svg', '.mp3', '.mp4', '.zip',
]);
