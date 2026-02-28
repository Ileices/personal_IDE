// ============================================
// PanelErrorBoundary — Isolates crashes per panel
//
// Wraps each major UI panel (Chat, Code, Agent, etc.)
// so that a crash in one doesn't blank the entire IDE.
//
// Features:
//   - Auto-recovery after cooldown (prevents infinite loops)
//   - Compact inline error display (not full-screen)
//   - Optional onError callback for telemetry
// ============================================
import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  /** Human-readable name shown in the fallback UI */
  name: string;
  /** Optional callback when error is caught */
  onError?: (error: Error, info: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  /** Epoch ms of last recovery attempt — used to prevent infinite loops */
  lastRecovery: number;
}

const MIN_RECOVERY_GAP_MS = 3000; // Don't auto-retry faster than this

export class PanelErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, lastRecovery: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error(`[PanelErrorBoundary:${this.props.name}]`, error, info.componentStack);
    this.props.onError?.(error, info);
  }

  handleRetry = (): void => {
    const now = Date.now();
    if (now - this.state.lastRecovery < MIN_RECOVERY_GAP_MS) {
      // Too fast — the panel is crash-looping. Stay in error state.
      return;
    }
    this.setState({ hasError: false, error: null, lastRecovery: now });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center gap-2 p-4 text-xs font-mono h-full bg-ide-bg/60">
          <AlertTriangle className="w-5 h-5 text-red-400" />
          <span className="text-red-400 font-semibold">{this.props.name} crashed</span>
          <span className="text-ide-text-dim max-w-xs truncate text-center">{this.state.error?.message}</span>
          <button
            onClick={this.handleRetry}
            className="mt-1 flex items-center gap-1 px-3 py-1 rounded bg-ide-accent/20 hover:bg-ide-accent/40 text-ide-accent transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
