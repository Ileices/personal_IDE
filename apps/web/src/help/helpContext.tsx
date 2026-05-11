import React, { createContext, useContext } from 'react';
import { HELP_ANCHORS } from './helpRegistry';
import type { ActivityView } from '../components/ActivityBar';
import type { EditorTab } from '../components/EditorArea';

const HIGHLIGHT_CLASS = 'help-target-highlight';

function highlightControl(helpId: string): void {
  const el = document.querySelector<HTMLElement>(`[data-help-id="${helpId}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  el.classList.remove(HIGHLIGHT_CLASS);
  // Force reflow so repeated highlight calls retrigger animation.
  void el.offsetWidth;
  el.classList.add(HIGHLIGHT_CLASS);
  window.setTimeout(() => {
    el.classList.remove(HIGHLIGHT_CLASS);
  }, 3200);
}

interface HelpFocus {
  helpId: string;
  nonce: number;
}

interface HelpContextValue {
  focus: HelpFocus | null;
  openHelpFor: (helpId: string) => void;
  goToControl: (helpId: string) => void;
}

export const HelpContext = createContext<HelpContextValue | null>(null);

interface HelpProviderProps {
  children: React.ReactNode;
  focus: HelpFocus | null;
  setFocus: (focus: HelpFocus | null) => void;
  setActiveView: (view: ActivityView) => void;
  setActiveTab: (tab: EditorTab) => void;
}

export function HelpProvider({ children, focus, setFocus, setActiveView, setActiveTab }: HelpProviderProps) {
  const openHelpFor = (helpId: string) => {
    if (!HELP_ANCHORS[helpId]) return;
    setActiveView('help');
    setFocus({ helpId, nonce: Date.now() });
  };

  const goToControl = (helpId: string) => {
    const anchor = HELP_ANCHORS[helpId];
    if (!anchor) return;
    if (anchor.view) setActiveView(anchor.view);
    if (anchor.tab) setActiveTab(anchor.tab);

    let attempts = 0;
    const tryFocus = () => {
      attempts += 1;
      const found = document.querySelector(`[data-help-id="${helpId}"]`);
      if (found) {
        highlightControl(helpId);
        return;
      }
      if (attempts < 10) {
        window.setTimeout(tryFocus, 120);
      }
    };
    window.setTimeout(tryFocus, 120);
  };

  return (
    <HelpContext.Provider value={{ focus, openHelpFor, goToControl }}>
      {children}
    </HelpContext.Provider>
  );
}

export function useHelp(): HelpContextValue {
  const ctx = useContext(HelpContext);
  if (!ctx) {
    throw new Error('useHelp must be used inside HelpProvider');
  }
  return ctx;
}
