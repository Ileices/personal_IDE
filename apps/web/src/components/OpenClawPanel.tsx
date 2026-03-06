// ============================================
// OpenClawPanel — skill browser, executor, and
// workflow builder for the OpenClaw ecosystem
// ============================================
import React, { useEffect, useState } from 'react';
import { useOpenClawStore, ClawSkill } from '../stores/openclawStore';
import {
  Cog, Play, ChevronDown, ChevronRight,
  Wrench, Shield, FileText, Zap, Search,
  Workflow, Clock, CheckCircle, XCircle,
  AlertTriangle,
} from 'lucide-react';

const categoryIcon = (cat: string) => {
  switch (cat) {
    case 'quality': return <Shield className="w-3 h-3" />;
    case 'testing': return <CheckCircle className="w-3 h-3" />;
    case 'documentation': return <FileText className="w-3 h-3" />;
    case 'security': return <Shield className="w-3 h-3 text-red-400" />;
    case 'refactoring': return <Wrench className="w-3 h-3" />;
    case 'performance': return <Zap className="w-3 h-3" />;
    case 'dependencies': return <Cog className="w-3 h-3" />;
    default: return <Cog className="w-3 h-3" />;
  }
};

function SkillCard({ skill, onExecute }: { skill: ClawSkill; onExecute: (s: ClawSkill) => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border border-ide-border rounded p-2 mb-1 bg-ide-bg hover:border-ide-accent/40 transition-colors">
      <div className="flex items-center gap-1.5 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {categoryIcon(skill.category)}
        <span className="text-xs font-medium flex-1">{skill.name}</span>
        <span className="text-[9px] text-ide-text-dim">{skill.version}</span>
        <button
          onClick={(e) => { e.stopPropagation(); onExecute(skill); }}
          className="p-0.5 rounded hover:bg-ide-accent/20 text-ide-accent"
          title="Execute"
        >
          <Play className="w-3 h-3" />
        </button>
      </div>
      {expanded && (
        <div className="mt-1.5 ml-5 text-[10px] text-ide-text-dim">
          <p>{skill.description}</p>
          {skill.inputSchema && Object.keys(skill.inputSchema).length > 0 && (
            <div className="mt-1">
              <span className="text-ide-text">Inputs: </span>
              {Object.entries(skill.inputSchema).map(([key, val]: [string, any]) => (
                <span key={key} className="inline-block bg-ide-bg-darker px-1 rounded mr-1">
                  {key}: {val?.type || 'any'}
                </span>
              ))}
            </div>
          )}
          {skill.builtIn && (
            <span className="inline-block mt-1 px-1 bg-ide-accent/10 text-ide-accent rounded text-[9px]">
              Built-in
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function OpenClawPanel() {
  const {
    skills, categories, workflows, executionLog,
    loading, panelOpen,
    fetchSkills, fetchCategories, fetchWorkflows, fetchLog,
    executeSkill, togglePanel,
  } = useOpenClawStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'skills' | 'workflows' | 'log'>('skills');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [safetyDismissed, setSafetyDismissed] = useState(false);

  useEffect(() => {
    if (panelOpen) {
      fetchSkills();
      fetchCategories();
      fetchWorkflows();
      fetchLog();
    }
  }, [panelOpen]);

  const handleExecute = async (skill: ClawSkill) => {
    try {
      await executeSkill(skill.id);
    } catch (err: any) {
      console.error('OpenClaw skill execution failed:', skill.id, err);
    }
  };

  const filteredSkills = skills.filter(s => {
    const matchesCategory = !selectedCategory || s.category === selectedCategory;
    const matchesSearch = !searchQuery ||
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  if (!panelOpen) {
    return (
      <button
        onClick={togglePanel}
        className="flex items-center gap-1 px-2 py-1 text-[10px] text-ide-text-dim hover:text-ide-text border-t border-ide-border w-full"
        title="Open CLAW Skills"
      >
        <Wrench className="w-3 h-3 text-ide-accent" />
        <span>Open CLAW</span>
        <span className="text-ide-accent ml-1">{skills.length}</span>
      </button>
    );
  }

  return (
    <div className="flex flex-col border-t border-ide-border bg-ide-bg" style={{ maxHeight: '40%' }}>
      {/* Header */}
      <div className="flex items-center px-2 py-1 border-b border-ide-border flex-shrink-0">
        <Wrench className="w-3.5 h-3.5 text-ide-accent mr-1.5" />
        <span className="text-xs font-semibold flex-1">Open CLAW</span>
        <div className="flex gap-0.5">
          {(['skills', 'workflows', 'log'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-1.5 py-0.5 text-[10px] rounded ${
                activeTab === tab ? 'bg-ide-accent/20 text-ide-accent' : 'text-ide-text-dim hover:text-ide-text'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <button onClick={togglePanel} className="ml-2 text-ide-text-dim hover:text-ide-text text-xs">✕</button>
      </div>

      {/* Safety Warning Banner */}
      {!safetyDismissed && (
        <div className="mx-2 mt-1.5 p-2 rounded border border-yellow-500/40 bg-yellow-500/10 text-[10px]">
          <div className="flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-yellow-300 mb-0.5">⚠ Automated Usage Risks</p>
              <p className="text-ide-text-dim leading-relaxed">
                Automated/bulk API usage may violate ToS for: <strong className="text-yellow-300">GitHub Copilot</strong> (no automated pipelines),{' '}
                <strong className="text-yellow-300">OpenAI</strong> (rate limits enforced), <strong className="text-yellow-300">Google Gemini</strong> (abuse detection).{' '}
                Use local models (Ollama) or APIs with explicit automation support for fleet/24-7 mode. Always respect rate limits and cooldowns.
              </p>
            </div>
            <button onClick={() => setSafetyDismissed(true)} className="text-ide-text-dim hover:text-ide-text ml-1 flex-shrink-0">✕</button>
          </div>
        </div>
      )}

      {/* Skills tab */}
      {activeTab === 'skills' && (
        <div className="flex-1 overflow-y-auto p-2">
          {/* Search + filter */}
          <div className="flex gap-1 mb-2">
            <div className="flex-1 relative">
              <Search className="w-3 h-3 absolute left-1.5 top-1.5 text-ide-text-dim" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search skills..."
                className="w-full pl-5 pr-2 py-1 text-[10px] bg-ide-bg-darker rounded border border-ide-border text-ide-text outline-none focus:border-ide-accent/40"
              />
            </div>
            <select
              value={selectedCategory || ''}
              onChange={e => setSelectedCategory(e.target.value || null)}
              className="text-[10px] bg-ide-bg-darker border border-ide-border rounded px-1 text-ide-text outline-none"
            >
              <option value="">All</option>
              {categories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {filteredSkills.length === 0 ? (
            <div className="text-center text-ide-text-dim text-[10px] mt-4">
              {loading ? 'Loading...' : 'No skills found.'}
            </div>
          ) : (
            filteredSkills.map(s => (
              <SkillCard key={s.id} skill={s} onExecute={handleExecute} />
            ))
          )}
        </div>
      )}

      {/* Workflows tab */}
      {activeTab === 'workflows' && (
        <div className="flex-1 overflow-y-auto p-2">
          {workflows.length === 0 ? (
            <div className="text-center text-ide-text-dim text-[10px] mt-4">
              <Workflow className="w-6 h-6 mx-auto mb-1 opacity-30" />
              <p>No workflows yet.</p>
              <p className="mt-1">Chain skills together to create automated pipelines.</p>
            </div>
          ) : (
            workflows.map(wf => (
              <div key={wf.id} className="border border-ide-border rounded p-2 mb-1">
                <div className="flex items-center gap-1">
                  <Workflow className="w-3 h-3 text-ide-accent" />
                  <span className="text-xs font-medium">{wf.name}</span>
                  <span className="text-[9px] text-ide-text-dim ml-auto">{wf.steps.length} steps</span>
                </div>
                <p className="text-[10px] text-ide-text-dim mt-0.5">{wf.description}</p>
              </div>
            ))
          )}
        </div>
      )}

      {/* Execution log tab */}
      {activeTab === 'log' && (
        <div className="flex-1 overflow-y-auto p-2">
          {executionLog.length === 0 ? (
            <div className="text-center text-ide-text-dim text-[10px] mt-4">
              <Clock className="w-6 h-6 mx-auto mb-1 opacity-30" />
              <p>No executions yet.</p>
            </div>
          ) : (
            executionLog.map((ex, i) => (
              <div key={i} className="flex items-center gap-1.5 py-0.5 text-[10px] border-b border-ide-border/50">
                {ex.success
                  ? <CheckCircle className="w-3 h-3 text-green-400" />
                  : <XCircle className="w-3 h-3 text-red-400" />
                }
                <span className="text-ide-text">{ex.skillId}</span>
                <span className="text-ide-text-dim ml-auto">{ex.durationMs}ms</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
