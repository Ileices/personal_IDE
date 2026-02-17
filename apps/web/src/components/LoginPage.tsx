// ============================================
// Login Page - GitHub PAT authentication
// ============================================
import React, { useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { LogIn, Key, AlertCircle, User, Trash2, CheckCircle, ExternalLink } from 'lucide-react';

export function LoginPage() {
  const { login, switchAccount, removeAccount, accounts, error, isLoading, clearError } = useAuthStore();
  const [pat, setPat] = useState('');
  const [showPatInput, setShowPatInput] = useState(accounts.length === 0);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pat.trim()) return;
    const success = await login(pat.trim());
    if (success) setPat('');
  };

  return (
    <div className="h-full flex items-center justify-center bg-ide-bg">
      <div className="max-w-md w-full mx-4">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-ide-accent/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Key className="w-8 h-8 text-ide-accent" />
          </div>
          <h1 className="text-2xl font-bold text-ide-text">Personal IDE</h1>
          <p className="text-ide-text-dim mt-2">AI-Powered Coding Assistant</p>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-ide-error/10 border border-ide-error/30 rounded-lg p-3 mb-4 flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-ide-error shrink-0 mt-0.5" />
            <div>
              <p className="text-ide-error text-sm">{error}</p>
              <button onClick={clearError} className="text-ide-error/60 text-xs mt-1 hover:underline">Dismiss</button>
            </div>
          </div>
        )}

        {/* Saved Accounts */}
        {accounts.length > 0 && (
          <div className="bg-ide-sidebar rounded-lg border border-ide-border mb-4">
            <div className="p-3 border-b border-ide-border">
              <h3 className="text-sm font-medium text-ide-text-dim">Saved Accounts</h3>
            </div>
            <div className="divide-y divide-ide-border">
              {accounts.map(acc => (
                <div key={acc.id} className="p-3 flex items-center gap-3 hover:bg-ide-bg/50">
                  <img src={acc.avatarUrl} alt="" className="w-8 h-8 rounded-full" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{acc.name || acc.login}</div>
                    <div className="text-xs text-ide-text-dim flex items-center gap-1">
                      @{acc.login}
                      {acc.hasCopilot && (
                        <span className="text-ide-success">• Copilot</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => switchAccount(acc.id)}
                      disabled={isLoading}
                      className="px-3 py-1.5 bg-ide-accent text-ide-panel text-xs font-medium rounded hover:bg-ide-accent/80 disabled:opacity-50"
                    >
                      {acc.isActive ? <CheckCircle className="w-4 h-4" /> : 'Login'}
                    </button>
                    <button
                      onClick={() => removeAccount(acc.id)}
                      className="p-1.5 text-ide-text-dim hover:text-ide-error rounded"
                      title="Remove account"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Toggle PAT input */}
        {!showPatInput && accounts.length > 0 && (
          <button
            onClick={() => setShowPatInput(true)}
            className="w-full p-3 border border-dashed border-ide-border rounded-lg text-ide-text-dim text-sm hover:border-ide-accent hover:text-ide-accent transition-colors mb-4"
          >
            + Add another account
          </button>
        )}

        {/* PAT Login Form */}
        {showPatInput && (
          <form onSubmit={handleLogin} className="bg-ide-sidebar rounded-lg border border-ide-border p-4">
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
              <LogIn className="w-4 h-4 text-ide-accent" />
              Login with GitHub PAT
            </h3>

            <div className="mb-3">
              <label className="block text-xs text-ide-text-dim mb-1.5">
                Personal Access Token
              </label>
              <input
                type="password"
                value={pat}
                onChange={e => setPat(e.target.value)}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                className="w-full bg-ide-bg border border-ide-border rounded px-3 py-2 text-sm text-ide-text placeholder:text-ide-text-dim/50 focus:outline-none focus:border-ide-accent"
                autoFocus
              />
            </div>

            <div className="bg-ide-bg/50 rounded p-2.5 mb-3">
              <p className="text-xs text-ide-text-dim">
                <strong>How to get a token:</strong>
              </p>
              <ol className="text-xs text-ide-text-dim mt-1 space-y-0.5 list-decimal list-inside">
                <li>Go to GitHub → Settings → Developer settings</li>
                <li>Click "Personal access tokens" → "Tokens (classic)"</li>
                <li>Generate new token with scopes: <code className="text-ide-accent">read:user</code>, <code className="text-ide-accent">models:read</code></li>
              </ol>
              <a
                href="https://github.com/settings/tokens/new"
                target="_blank"
                rel="noopener"
                className="text-xs text-ide-accent hover:underline mt-1.5 inline-flex items-center gap-1"
              >
                Open GitHub Token Page <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <button
              type="submit"
              disabled={isLoading || !pat.trim()}
              className="w-full bg-ide-accent text-ide-panel font-medium py-2 rounded hover:bg-ide-accent/80 disabled:opacity-50 transition-colors text-sm"
            >
              {isLoading ? 'Authenticating...' : 'Sign In'}
            </button>

            {accounts.length > 0 && (
              <button
                type="button"
                onClick={() => setShowPatInput(false)}
                className="w-full text-ide-text-dim text-xs mt-2 hover:text-ide-text"
              >
                Cancel
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
