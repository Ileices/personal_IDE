// ============================================
// Activity Bar — VS Code-style left icon rail
// Each icon switches the active side-panel view
// and optionally a main-area view (preview, etc.)
// ============================================
import React from 'react';
import {
  FolderOpen, MessageSquare, Bot, Globe, Network,
  Waves, Database, Bird, Clock, Settings, GitBranch,
  ShieldCheck, Zap, HelpCircle, BarChart2, Sparkles, Fingerprint, Cpu,
  Tag, AlertTriangle, Scan, Layers, Briefcase, Users,
} from 'lucide-react';
import { HelpTip } from './HelpTip';

export type ActivityView =
  | 'explorer'
  | 'chat'
  | 'agent'
  | 'preview'
  | 'fleet'
  | 'nano'
  | 'memory'
  | 'midwife'
  | 'checkpoints'
  | 'providers'
  | 'security'
  | 'studio'
  | 'strategy'
  | 'rates'
  | 'blame'
  | 'local-models'
  | 'tags'
  | 'forensic'
  | 'gap'
  | 'project-state-crawler'
  | 'suggested-jobs'
  | 'community'
  | 'help';

interface ActivityBarProps {
  active: ActivityView;
  onChange: (view: ActivityView) => void;
  /** Show a dot badge on fleet to indicate active agents */
  fleetBadge?: number;
  /** Show a dot badge on nano to indicate running nanos */
  nanoBadge?: number;
}

interface NavItem {
  id: ActivityView;
  icon: React.ElementType;
  label: string;
  badge?: number;
  helpId: string;
}

export function ActivityBar({ active, onChange, fleetBadge, nanoBadge }: ActivityBarProps) {
  const items: NavItem[] = [
    { id: 'studio',      icon: Sparkles,       label: 'THE GOD FACTORY — AI Architect', helpId: 'activity.studio' },
    { id: 'explorer',    icon: FolderOpen,     label: 'Explorer', helpId: 'activity.explorer' },
    { id: 'chat',        icon: MessageSquare,  label: 'Chat', helpId: 'activity.chat' },
    { id: 'agent',       icon: Bot,            label: 'The Project Factory', helpId: 'activity.agent' },
    { id: 'preview',     icon: Globe,          label: 'Preview & Test', helpId: 'activity.preview' },
    { id: 'fleet',       icon: Network,        label: 'Project Factory Fleet', badge: fleetBadge, helpId: 'activity.fleet' },
    { id: 'nano',        icon: Waves,          label: 'Nano Sea', badge: nanoBadge, helpId: 'activity.nano' },
    { id: 'midwife',     icon: Bird,           label: 'Midwife Trainer', helpId: 'activity.midwife' },
    { id: 'memory',      icon: Database,       label: 'Memory', helpId: 'activity.memory' },
    { id: 'checkpoints', icon: Clock,          label: 'Checkpoints', helpId: 'activity.checkpoints' },
    { id: 'strategy',    icon: Zap,            label: 'Model Strategy & Fallbacks', helpId: 'activity.strategy' },
    { id: 'rates',       icon: BarChart2,      label: 'Rate Limits & Usage', helpId: 'activity.rates' },
    { id: 'blame',       icon: Fingerprint,    label: 'BLAME — Model Quality Tracking', helpId: 'activity.blame' },
    { id: 'local-models', icon: Cpu,           label: 'Local Model Catalog (Ollama)', helpId: 'activity.local-models' },
    { id: 'tags',        icon: Tag,            label: 'Tag Registry — Devtags / Plantags / Buildtags', helpId: 'activity.tags' },
    { id: 'forensic',    icon: AlertTriangle,  label: 'Forensic Database — Agent Audit Tables', helpId: 'activity.forensic' },
    { id: 'gap',         icon: Scan,           label: 'Gap Analysis — Coverage, Debt, Patterns', helpId: 'activity.gap' },
    { id: 'project-state-crawler', icon: Layers, label: 'Project State Crawler — Devtag Extraction & Drift', helpId: 'activity.project-state-crawler' },
    { id: 'suggested-jobs', icon: Briefcase, label: 'Suggested Jobs — Codebase Review & Implementation Pipeline', helpId: 'activity.suggested-jobs' },
    { id: 'community',      icon: Users,    label: 'Community Hub — GitHub Discussions & Reporting', helpId: 'activity.community' },
  ];

  const bottomItems: NavItem[] = [
    { id: 'help',        icon: HelpCircle,     label: 'Help & Documentation', helpId: 'activity.help' },
    { id: 'providers',   icon: Settings,       label: 'Providers & Settings', helpId: 'activity.providers' },
    { id: 'security',    icon: ShieldCheck,    label: 'Security & Auth', helpId: 'activity.security' },
  ];

  return (
    <div className="flex flex-col items-center w-12 bg-ide-sidebar border-r border-ide-border flex-shrink-0 py-1">
      {/* Top group */}
      <div className="flex flex-col items-center gap-0.5 flex-1 overflow-y-auto scrollbar-none">
        {items.map(item => (
          <NavButton
            key={item.id}
            item={item}
            isActive={active === item.id}
            onClick={() => onChange(item.id)}
          />
        ))}
      </div>

      {/* Divider */}
      <div className="w-8 border-t border-ide-border my-1" />

      {/* Bottom group */}
      <div className="flex flex-col items-center gap-0.5 pb-1">
        {bottomItems.map(item => (
          <NavButton
            key={item.id}
            item={item}
            isActive={active === item.id}
            onClick={() => onChange(item.id)}
          />
        ))}
      </div>
    </div>
  );
}

function NavButton({ item, isActive, onClick }: {
  item: NavItem;
  isActive: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <div className="relative group" data-help-id={item.helpId}>
      <button
        title={item.label}
        onClick={onClick}
        className={[
          'relative w-10 h-10 flex items-center justify-center rounded-md transition-all',
          isActive
            ? 'text-ide-accent bg-ide-accent/15 border-l-2 border-ide-accent -ml-px rounded-l-none'
            : 'text-ide-text-dim hover:text-ide-text hover:bg-ide-bg/50',
        ].join(' ')}
      >
        <Icon className="w-5 h-5" />
        {item.badge != null && item.badge > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[14px] h-3.5 px-0.5 text-[9px] font-bold bg-ide-accent text-ide-panel rounded-full flex items-center justify-center leading-none">
            {item.badge > 99 ? '99+' : item.badge}
          </span>
        )}
      </button>
      <HelpTip helpId={item.helpId} className="absolute -right-1 -bottom-1 opacity-0 group-hover:opacity-100" />
    </div>
  );
}
