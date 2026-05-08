// ============================================
// Update Banner — top-centre notification strip
// Shown when behindCount > 0 (new commits on origin/main)
// ============================================
import React, { useState } from 'react';
import { ArrowDownCircle, X, Loader2, RefreshCw } from 'lucide-react';
import { API_BASE } from '../config.js';

export interface UpdateInfo {
  behindCount: number;
  branch: string;
  remoteHead?: string;
}

interface UpdateBannerProps {
  info: UpdateInfo;
  onDismiss: () => void;
  onUpdated: () => void;
}

export function UpdateBanner({ info, onDismiss, onUpdated }: UpdateBannerProps) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  async function handleUpdate() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/app/update`, { method: 'POST' });
      const data = await res.json() as { success: boolean; message: string; alreadyUpToDate?: boolean };
      setResult(data);
      if (data.success && !data.alreadyUpToDate) {
        // Give user a moment to read success message then dismiss
        setTimeout(onUpdated, 3000);
      }
    } catch (err: any) {
      setResult({ success: false, message: err.message || 'Update failed.' });
    } finally {
      setBusy(false);
    }
  }

  if (result?.success) {
    return (
      <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 px-4 py-2 bg-green-900/90 border border-green-500/50 rounded-lg shadow-2xl text-sm text-green-100 backdrop-blur-sm">
        <RefreshCw size={14} className="text-green-300 shrink-0" />
        <span className="font-medium">Updated! Restart the dev server to apply changes.</span>
        <button onClick={onDismiss} className="ml-1 text-green-300 hover:text-green-100">
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 px-4 py-2 bg-ide-sidebar/95 border border-ide-accent/40 rounded-lg shadow-2xl text-sm text-ide-text backdrop-blur-sm">
      <ArrowDownCircle size={15} className="text-ide-accent shrink-0" />
      <span>
        <span className="font-semibold text-ide-accent">{info.behindCount}</span>
        {' '}new update{info.behindCount !== 1 ? 's' : ''} available on{' '}
        <span className="font-medium">{info.branch}</span>
      </span>

      {result?.success === false && (
        <span className="text-red-300 text-xs max-w-40 truncate" title={result.message}>
          {result.message}
        </span>
      )}

      <button
        onClick={handleUpdate}
        disabled={busy}
        className="flex items-center gap-1.5 px-2.5 py-1 bg-ide-accent text-white text-xs rounded hover:bg-ide-accent/90 disabled:opacity-50 transition-colors"
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : <ArrowDownCircle size={12} />}
        {busy ? 'Updating…' : 'Update Now'}
      </button>

      <button
        onClick={onDismiss}
        className="text-ide-text-dim hover:text-ide-text transition-colors"
        title="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}
