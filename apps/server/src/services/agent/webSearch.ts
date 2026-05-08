// ============================================
// Web Search Service
// Gives the agent ability to search the web
// for documentation, error solutions, etc.
// Uses DuckDuckGo HTML API (no API key needed)
// ============================================

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface WebSearchResult {
  query: string;
  results: SearchResult[];
  error?: string;
}

// ─── SSRF / Private-network block list ─────────────────────────────────────
// Prevent web search from being weaponized to probe local infrastructure.
// Any search result URL pointing to these targets is dropped.
const BLOCKED_HOST_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\.0\.0\.0$/,
  /^169\.254\./,    // AWS metadata / link-local
  /^::1$/,          // IPv6 loopback
  /^fc00:/i,        // IPv6 private
];

function isBlockedUrl(rawUrl: string): boolean {
  try {
    const { hostname } = new URL(rawUrl);
    return BLOCKED_HOST_PATTERNS.some(p => p.test(hostname));
  } catch {
    return false; // malformed URLs are kept — DuckDuckGo may return them
  }
}

/** Search the web using DuckDuckGo Lite (no API key required) */
export async function webSearch(query: string, maxResults = 5): Promise<WebSearchResult> {
  try {
    const encoded = encodeURIComponent(query);
    const url = `https://html.duckduckgo.com/html/?q=${encoded}`;

    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; IDE-Agent/1.0)',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(10_000), // 10 second timeout for search
    });

    if (!resp.ok) {
      return { query, results: [], error: `HTTP ${resp.status}` };
    }

    const html = await resp.text();
    const results = parseDDGResults(html, maxResults);

    return { query, results };
  } catch (err: any) {
    return { query, results: [], error: err.message };
  }
}

/** Parse DuckDuckGo HTML results */
function parseDDGResults(html: string, max: number): SearchResult[] {
  const results: SearchResult[] = [];

  // Match result blocks: <a class="result__a" href="...">title</a> + <a class="result__snippet">snippet</a>
  const linkRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

  const links: Array<{ url: string; title: string }> = [];
  let linkMatch;
  while ((linkMatch = linkRegex.exec(html)) !== null && links.length < max) {
    const rawUrl = linkMatch[1];
    const title = stripHtml(linkMatch[2]).trim();

    // DDG wraps URLs in a redirect, extract real URL
    let url = rawUrl;
    const uddgMatch = rawUrl.match(/uddg=([^&]+)/);
    if (uddgMatch) {
      url = decodeURIComponent(uddgMatch[1]);
    }

    if (title && url && !url.includes('duckduckgo.com') && !isBlockedUrl(url)) {
      links.push({ url, title });
    }
  }

  const snippets: string[] = [];
  let snippetMatch;
  while ((snippetMatch = snippetRegex.exec(html)) !== null) {
    snippets.push(stripHtml(snippetMatch[1]).trim());
  }

  for (let i = 0; i < links.length && i < max; i++) {
    results.push({
      title: links[i].title,
      url: links[i].url,
      snippet: snippets[i] || '',
    });
  }

  return results;
}

/** Fetch a web page and extract main text content */
export async function fetchWebPage(url: string, maxChars = 8000): Promise<{ url: string; content: string; error?: string }> {
  // SSRF protection: block internal network targets
  if (isBlockedUrl(url)) {
    return { url, content: '', error: 'SSRF blocked: URL targets private network' };
  }
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; IDE-Agent/1.0)',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(15_000), // 15 seconds — web pages shouldn't take longer
    });

    if (!resp.ok) {
      return { url, content: '', error: `HTTP ${resp.status}` };
    }

    const html = await resp.text();
    const text = extractMainContent(html);
    return { url, content: text.slice(0, maxChars) };
  } catch (err: any) {
    return { url, content: '', error: err.message };
  }
}

/** Extract main readable text from HTML */
function extractMainContent(html: string): string {
  // Remove script and style tags
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '');

  // Try to find <main> or <article> content first
  const mainMatch = text.match(/<(?:main|article)[^>]*>([\s\S]*?)<\/(?:main|article)>/i);
  if (mainMatch) {
    text = mainMatch[1];
  }

  // Strip remaining HTML tags
  text = stripHtml(text);

  // Clean up whitespace
  text = text
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();

  return text;
}

/** Strip HTML tags from text */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/** Format search results for LLM context */
export function formatSearchForLLM(searchResult: WebSearchResult): string {
  if (searchResult.results.length === 0) {
    return `Web search for "${searchResult.query}": No results found.${searchResult.error ? ' Error: ' + searchResult.error : ''}`;
  }

  let output = `--- WEB SEARCH RESULTS for "${searchResult.query}" ---\n`;
  for (const r of searchResult.results) {
    output += `\n[${r.title}]\nURL: ${r.url}\n${r.snippet}\n`;
  }
  output += '\n--- END SEARCH RESULTS ---';
  return output;
}
