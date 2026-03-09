// ============================================
// PreviewPanel — Replit-style app preview with
// iframe, URL bar, console output, and controls.
// ============================================
import { useState, useRef, useCallback, useEffect } from 'react';

interface PreviewPanelProps {
  /** Default URL to preview */
  defaultUrl?: string;
  /** Height of the panel */
  height?: string;
  /** Server status from the agent */
  serverStatus?: {
    running: boolean;
    url: string;
    port: number;
    errors?: string[];
  };
}

export function PreviewPanel({
  defaultUrl = 'http://localhost:5173',
  height = '100%',
  serverStatus,
}: PreviewPanelProps) {
  const [url, setUrl] = useState(defaultUrl);
  const [inputUrl, setInputUrl] = useState(defaultUrl);
  const [isLoading, setIsLoading] = useState(false);
  const [consoleOutput, setConsoleOutput] = useState<string[]>([]);
  const [showConsole, setShowConsole] = useState(false);
  const [iframeError, setIframeError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Navigate to URL
  const navigate = useCallback((targetUrl: string) => {
    try {
      const parsed = new URL(targetUrl);
      setUrl(parsed.href);
      setInputUrl(parsed.href);
      setIframeError(false);
      setIsLoading(true);
    } catch {
      // Invalid URL — try adding http://
      try {
        const withHttp = new URL('http://' + targetUrl);
        setUrl(withHttp.href);
        setInputUrl(withHttp.href);
        setIframeError(false);
        setIsLoading(true);
      } catch {
        setConsoleOutput(prev => [...prev, `❌ Invalid URL: ${targetUrl}`]);
      }
    }
  }, []);

  // Refresh iframe
  const refresh = useCallback(() => {
    if (iframeRef.current) {
      setIsLoading(true);
      setIframeError(false);
      iframeRef.current.src = url;
    }
  }, [url]);

  // Update URL when server status changes
  useEffect(() => {
    if (serverStatus?.running && serverStatus.url) {
      navigate(serverStatus.url);
    }
  }, [serverStatus?.running, serverStatus?.url, navigate]);

  // Log server errors
  useEffect(() => {
    if (serverStatus?.errors?.length) {
      setConsoleOutput(prev => [
        ...prev,
        ...serverStatus.errors!.map(e => `⚠️ Server: ${e}`),
      ]);
    }
  }, [serverStatus?.errors]);

  return (
    <div className="flex flex-col bg-zinc-900 border border-zinc-700 rounded-lg overflow-hidden" style={{ height }}>
      {/* URL Bar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800 border-b border-zinc-700">
        <button
          onClick={refresh}
          className="p-1.5 hover:bg-zinc-700 rounded text-zinc-400 hover:text-white transition-colors"
          title="Refresh"
        >
          🔄
        </button>
        <form
          className="flex-1 flex"
          onSubmit={(e) => { e.preventDefault(); navigate(inputUrl); }}
        >
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            className="flex-1 bg-zinc-900 text-zinc-200 text-sm px-3 py-1.5 rounded-l border border-zinc-600 focus:border-blue-500 focus:outline-none"
            placeholder="http://localhost:5173"
          />
          <button
            type="submit"
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-r hover:bg-blue-500 transition-colors"
          >
            Go
          </button>
        </form>
        <button
          onClick={() => setShowConsole(prev => !prev)}
          className={`p-1.5 rounded text-sm transition-colors ${
            showConsole ? 'bg-zinc-600 text-white' : 'hover:bg-zinc-700 text-zinc-400 hover:text-white'
          }`}
          title="Toggle console"
        >
          🖥️ Console
        </button>
        {/* Status indicator */}
        <div
          className={`w-2 h-2 rounded-full ${
            serverStatus?.running ? 'bg-green-500' : isLoading ? 'bg-yellow-500 animate-pulse' : 'bg-zinc-500'
          }`}
          title={serverStatus?.running ? 'Server running' : isLoading ? 'Loading...' : 'Not connected'}
        />
      </div>

      {/* Main content area */}
      <div className="flex-1 relative">
        {iframeError ? (
          <div className="flex items-center justify-center h-full text-zinc-400">
            <div className="text-center">
              <p className="text-4xl mb-4">🌐</p>
              <p className="text-lg font-medium">Cannot reach {url}</p>
              <p className="text-sm mt-2">Start a dev server or enter a valid URL above.</p>
              <button
                onClick={refresh}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500 transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            src={url}
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            onLoad={() => setIsLoading(false)}
            onError={() => { setIframeError(true); setIsLoading(false); }}
            title="App Preview"
          />
        )}

        {/* Loading overlay */}
        {isLoading && !iframeError && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/50">
            <div className="text-zinc-300 animate-pulse">Loading...</div>
          </div>
        )}
      </div>

      {/* Console output */}
      {showConsole && (
        <div className="border-t border-zinc-700 bg-zinc-950 max-h-48 overflow-y-auto">
          <div className="flex items-center justify-between px-3 py-1 bg-zinc-800 border-b border-zinc-700">
            <span className="text-xs text-zinc-400">Console Output</span>
            <button
              onClick={() => setConsoleOutput([])}
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              Clear
            </button>
          </div>
          <div className="p-2 text-xs font-mono text-zinc-300 space-y-0.5">
            {consoleOutput.length === 0 ? (
              <p className="text-zinc-500 italic">No output yet.</p>
            ) : (
              consoleOutput.map((line, i) => (
                <p key={i} className={line.startsWith('❌') ? 'text-red-400' : line.startsWith('⚠') ? 'text-yellow-400' : ''}>
                  {line}
                </p>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
