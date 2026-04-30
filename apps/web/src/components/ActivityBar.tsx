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
} from 'lucide-react';

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
}

export function ActivityBar({ active, onChange, fleetBadge, nanoBadge }: ActivityBarProps) {
  const items: NavItem[] = [
    { id: 'studio',      icon: Sparkles,       label: 'THE GOD FACTORY — AI Architect' },
    { id: 'explorer',    icon: FolderOpen,     label: 'Explorer' },
    { id: 'chat',        icon: MessageSquare,  label: 'Chat' },
    { id: 'agent',       icon: Bot,            label: 'Agent' },
    { id: 'preview',     icon: Globe,          label: 'Preview & Test' },
    { id: 'fleet',       icon: Network,        label: 'Agent Fleet', badge: fleetBadge },
    { id: 'nano',        icon: Waves,          label: 'Nano Sea',    badge: nanoBadge },
    { id: 'midwife',     icon: Bird,           label: 'Midwife Trainer' },
    { id: 'memory',      icon: Database,       label: 'Memory' },
    { id: 'checkpoints', icon: Clock,          label: 'Checkpoints' },
    { id: 'strategy',    icon: Zap,            label: 'Model Strategy & Fallbacks' },
    { id: 'rates',       icon: BarChart2,      label: 'Rate Limits & Usage' },
    { id: 'blame',       icon: Fingerprint,    label: 'BLAME — Model Quality Tracking' },
    { id: 'local-models', icon: Cpu,             label: 'Local Model Catalog (Ollama)' },
  ];

  const bottomItems: NavItem[] = [
    { id: 'help',        icon: HelpCircle,     label: 'Help & Documentation' },
    { id: 'providers',   icon: Settings,       label: 'Providers & Settings' },
    { id: 'security',    icon: ShieldCheck,    label: 'Security & Auth' },
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
      {/* Badge */}
      {item.badge != null && item.badge > 0 && (
        <span className="absolute top-0.5 right-0.5 min-w-[14px] h-3.5 px-0.5 text-[9px] font-bold bg-ide-accent text-ide-panel rounded-full flex items-center justify-center leading-none">
          {item.badge > 99 ? '99+' : item.badge}
        </span>
      )}
    </button>
  );
}
