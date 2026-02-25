// ============================================
// Error Panel - VS Code-style error highlighting
// Shows lint errors, test failures, agent feedback
// ============================================
import React, { useState, useEffect } from 'react';
import {
  AlertCircle, AlertTriangle, Info, CheckCircle2,
  Play, RefreshCw, ChevronDown, ChevronRight,
  FileCode, TestTube2, Loader2, X
} from 'lucide-react';

const API_BASE = 'http://localhost:3001';

interface CodeError {
  file: string;
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'info' | 'hint';
  message: string;
  source: string;
  code?: string;
}

interface TestResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration?: number;
  failures: { message: string; expected?: string; actual?: string; stack?: string }[];
}

type Tab = 'errors' | 'tests';

export function ErrorPanel({ projectRoot }: { projectRoot: string }) {
  const [activeTab, setActiveTab] = useState<Tab>('errors');
  const [errors, setErrors] = useState<CodeError[]>([]);
  const [tests, setTests] = useState<TestResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState(false);

  // Group errors by file
  const errorsByFile = errors.reduce((acc, e) => {
    if (!acc[e.file]) acc[e.file] = [];
    acc[e.file].push(e);
    return acc;
  }, {} as Record<string, CodeError[]>);

  const errorCount = errors.filter(e => e.severity === 'error').length;
  const warningCount = errors.filter(e => e.severity === 'warning').length;
  const testPassed = tests.filter(t => t.status === 'passed').length;
  const testFailed = tests.filter(t => t.status === 'failed').length;

  async function runLintCheck() {
    if (!projectRoot) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/errors/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectRoot }),
      });
      const data = await res.json();
      setErrors(data.errors || []);
    } catch (err) {
      console.error('Lint check failed:', err);
    } finally {
      setLoading(false);
    }
  }

  async function runTestSuite() {
    if (!projectRoot) return;
    setLoading(true);
    setActiveTab('tests');
    try {
      const res = await fetch(`${API_BASE}/api/errors/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectRoot }),
      });
      const data = await res.json();
      setTests(data.results || []);
    } catch (err) {
      console.error('Test run failed:', err);
    } finally {
      setLoading(false);
    }
  }

  function toggleFile(file: string) {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(file)) next.delete(file);
      else next.add(file);
      return next;
    });
  }

  const severityIcon = (severity: string) => {
    switch (severity) {
      case 'error': return <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />;
      case 'warning': return <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />;
      case 'info': return <Info className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />;
      default: return <Info className="w-3.5 h-3.5 text-ide-text-dim flex-shrink-0" />;
    }
  };

  if (collapsed) {
    return (
      <div
        className="h-6 bg-ide-sidebar border-t border-ide-border flex items-center px-3 gap-3 cursor-pointer hover:bg-ide-bg transition-colors"
        onClick={() => setCollapsed(false)}
      >
        <ChevronRight className="w-3 h-3" />
        <span className="text-[10px] text-ide-text-dim">Problems</span>
        {errorCount > 0 && (
          <span className="text-[10px] text-red-400 flex items-center gap-0.5">
            <AlertCircle className="w-3 h-3" /> {errorCount}
          </span>
        )}
        {warningCount > 0 && (
          <span className="text-[10px] text-yellow-400 flex items-center gap-0.5">
            <AlertTriangle className="w-3 h-3" /> {warningCount}
          </span>
        )}
        {testFailed > 0 && (
          <span className="text-[10px] text-red-400 flex items-center gap-0.5">
            <TestTube2 className="w-3 h-3" /> {testFailed} failed
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="h-48 bg-ide-sidebar border-t border-ide-border flex flex-col flex-shrink-0">
      {/* Header */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-ide-border">
        {/* Tabs */}
        <button
          onClick={() => setActiveTab('errors')}
          className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded ${
            activeTab === 'errors' ? 'bg-ide-bg text-ide-text' : 'text-ide-text-dim hover:text-ide-text'
          }`}
        >
          <FileCode className="w-3 h-3" />
          Problems
          {errorCount > 0 && <span className="text-red-400 ml-0.5">{errorCount}</span>}
          {warningCount > 0 && <span className="text-yellow-400 ml-0.5">{warningCount}</span>}
        </button>
        <button
          onClick={() => setActiveTab('tests')}
          className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded ${
            activeTab === 'tests' ? 'bg-ide-bg text-ide-text' : 'text-ide-text-dim hover:text-ide-text'
          }`}
        >
          <TestTube2 className="w-3 h-3" />
          Tests
          {testPassed > 0 && <span className="text-green-400 ml-0.5">{testPassed}</span>}
          {testFailed > 0 && <span className="text-red-400 ml-0.5">{testFailed}</span>}
        </button>

        <div className="flex-1" />

        {/* Actions */}
        <button
          onClick={runLintCheck}
          disabled={loading || !projectRoot}
          className="p-1 hover:bg-ide-bg rounded text-ide-text-dim hover:text-ide-text disabled:opacity-40"
          title="Run lint check"
        >
          {loading && activeTab === 'errors' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={runTestSuite}
          disabled={loading || !projectRoot}
          className="p-1 hover:bg-ide-bg rounded text-ide-text-dim hover:text-ide-text disabled:opacity-40"
          title="Run tests"
        >
          {loading && activeTab === 'tests' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={() => setCollapsed(true)}
          className="p-1 hover:bg-ide-bg rounded text-ide-text-dim hover:text-ide-text"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto text-xs">
        {activeTab === 'errors' && (
          errors.length === 0 ? (
            <div className="flex items-center justify-center h-full text-ide-text-dim text-[11px]">
              <CheckCircle2 className="w-4 h-4 mr-1.5 text-green-400" />
              {projectRoot ? 'No problems detected. Click refresh to check.' : 'Open a project to check for errors.'}
            </div>
          ) : (
            Object.entries(errorsByFile).map(([file, fileErrors]) => (
              <div key={file}>
                <button
                  onClick={() => toggleFile(file)}
                  className="w-full flex items-center gap-1.5 px-2 py-1 hover:bg-ide-bg/50 text-left"
                >
                  {expandedFiles.has(file) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  <FileCode className="w-3 h-3 text-ide-text-dim" />
                  <span className="text-[11px] font-medium truncate">{file}</span>
                  <span className="text-[10px] text-ide-text-dim ml-auto">{fileErrors.length}</span>
                </button>
                {expandedFiles.has(file) && fileErrors.map((e, i) => (
                  <div key={i} className="flex items-start gap-1.5 px-6 py-1 hover:bg-ide-bg/30">
                    {severityIcon(e.severity)}
                    <span className="text-[11px] flex-1">{e.message}</span>
                    <span className="text-[10px] text-ide-text-dim shrink-0">
                      Ln {e.line}, Col {e.column}
                    </span>
                    {e.source && <span className="text-[10px] text-ide-text-dim shrink-0">({e.source})</span>}
                  </div>
                ))}
              </div>
            ))
          )
        )}

        {activeTab === 'tests' && (
          tests.length === 0 ? (
            <div className="flex items-center justify-center h-full text-ide-text-dim text-[11px]">
              <TestTube2 className="w-4 h-4 mr-1.5" />
              Click the play button to run tests.
            </div>
          ) : (
            tests.map((t, i) => (
              <div key={i} className="px-3 py-1.5 hover:bg-ide-bg/30 border-b border-ide-border/30">
                <div className="flex items-center gap-1.5">
                  {t.status === 'passed' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                  ) : t.status === 'failed' ? (
                    <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                  ) : (
                    <Info className="w-3.5 h-3.5 text-yellow-400" />
                  )}
                  <span className="text-[11px]">{t.name}</span>
                  {t.duration !== undefined && (
                    <span className="text-[10px] text-ide-text-dim ml-auto">{t.duration}ms</span>
                  )}
                </div>
                {t.failures.map((f, fi) => (
                  <div key={fi} className="ml-5 mt-1 text-[10px] text-red-300 bg-red-500/5 rounded px-2 py-1">
                    {f.message}
                    {f.expected && <div className="text-green-400 mt-0.5">Expected: {f.expected}</div>}
                    {f.actual && <div className="text-red-400">Actual: {f.actual}</div>}
                  </div>
                ))}
              </div>
            ))
          )
        )}
      </div>
    </div>
  );
}
