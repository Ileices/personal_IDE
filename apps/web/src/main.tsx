import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

/** Global error boundary so a single component crash doesn't blank the screen */
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', background: '#1e1e2e', color: '#cdd6f4', fontFamily: 'monospace',
        }}>
          <h2 style={{ color: '#f38ba8', marginBottom: 12 }}>Something went wrong</h2>
          <pre style={{
            background: '#313244', padding: 16, borderRadius: 8, maxWidth: '80%',
            overflow: 'auto', fontSize: 13, color: '#f9e2af',
          }}>
            {this.state.error?.message}
            {'\n\n'}
            {this.state.error?.stack}
          </pre>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              marginTop: 16, padding: '8px 24px', background: '#89b4fa', color: '#1e1e2e',
              border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600,
            }}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
