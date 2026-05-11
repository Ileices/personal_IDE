import React, { useContext } from 'react';
import { HelpCircle } from 'lucide-react';
import { HelpContext } from '../help/helpContext';
import { HELP_ANCHORS } from '../help/helpRegistry';

interface HelpTipProps {
  helpId: string;
  className?: string;
}

export function HelpTip({ helpId, className = '' }: HelpTipProps) {
  const ctx = useContext(HelpContext);
  // Silently render nothing when mounted outside HelpProvider (portals, error boundaries, HMR)
  if (!ctx) return null;
  const { openHelpFor } = ctx;
  const entry = HELP_ANCHORS[helpId];
  if (!entry) return null;

  return (
    <button
      type="button"
      data-help-id={`${helpId}.tip`}
      onClick={(e) => {
        e.stopPropagation();
        openHelpFor(helpId);
      }}
      className={`relative inline-flex items-center justify-center w-4 h-4 rounded-full text-ide-text-dim hover:text-ide-accent hover:bg-ide-accent/15 transition-colors ${className}`}
      title={entry.quickTip}
      aria-label={`Help: ${entry.label}`}
    >
      <HelpCircle className="w-3.5 h-3.5" />
    </button>
  );
}
