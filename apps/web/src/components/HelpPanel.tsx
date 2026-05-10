import React, { useEffect, useMemo, useState } from 'react';
import { HelpCircle, Search, BookOpen, ExternalLink, Crosshair } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useHelp } from '../help/helpContext';
import { HELP_ANCHORS, HELP_ANCHORS_BY_SECTION, HELP_SECTIONS } from '../help/helpRegistry';

export function HelpPanel() {
  const { focus, goToControl } = useHelp();
  const [search, setSearch] = useState('');
  const [selectedSectionId, setSelectedSectionId] = useState<string>(HELP_SECTIONS[0]?.id ?? 'overview');
  const [selectedHelpId, setSelectedHelpId] = useState<string | null>(null);

  useEffect(() => {
    if (!focus) return;
    const anchor = HELP_ANCHORS[focus.helpId];
    if (!anchor) return;
    setSelectedSectionId(anchor.sectionId);
    setSelectedHelpId(anchor.id);
  }, [focus]);

  const tokens = useMemo(
    () => search.trim().toLowerCase().split(/\s+/).filter(Boolean),
    [search]
  );

  const matchesTokenSet = useMemo(() => {
    return (haystack: string) => tokens.every((t) => haystack.includes(t));
  }, [tokens]);

  const sectionResults = useMemo(() => {
    if (tokens.length === 0) return HELP_SECTIONS;
    return HELP_SECTIONS.filter((section) => {
      const anchors = HELP_ANCHORS_BY_SECTION[section.id] ?? [];
      const sectionBlob = [
        section.id,
        section.title,
        section.summary,
        section.status ?? '',
        ...(section.tags ?? []),
        ...section.details,
        ...anchors.map((anchor) => `${anchor.id} ${anchor.label} ${anchor.quickTip}`),
      ].join(' ').toLowerCase();
      return matchesTokenSet(sectionBlob);
    });
  }, [tokens, matchesTokenSet]);

  const section = HELP_SECTIONS.find((item) => item.id === selectedSectionId) ?? HELP_SECTIONS[0];

  const controls = useMemo(() => {
    const base = HELP_ANCHORS_BY_SECTION[section.id] ?? [];
    if (tokens.length === 0) return base;
    return base.filter((anchor) => {
      const sectionTags = (HELP_SECTIONS.find((s) => s.id === section.id)?.tags ?? []).join(' ').toLowerCase();
      const anchorBlob = `${anchor.id} ${anchor.label} ${anchor.quickTip} ${sectionTags}`.toLowerCase();
      return matchesTokenSet(anchorBlob);
    });
  }, [section.id, tokens, matchesTokenSet]);

  return (
    <div className="flex h-full min-h-0">
      <div className="w-64 border-r border-ide-border bg-ide-panel flex flex-col min-h-0">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-ide-border">
          <HelpCircle className="w-4 h-4 text-ide-accent" />
          <span className="text-xs font-semibold text-ide-text">Help & Documentation</span>
        </div>
        <div className="px-3 py-2 border-b border-ide-border">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-ide-text-dim" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search features and controls..."
              className="w-full bg-ide-bg border border-ide-border rounded pl-6 pr-2 py-1.5 text-xs focus:outline-none focus:border-ide-accent"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {sectionResults.map((item) => (
            <button
              key={item.id}
              onClick={() => setSelectedSectionId(item.id)}
              className={`w-full text-left px-3 py-2 border-b border-ide-border/40 transition-colors ${
                selectedSectionId === item.id
                  ? 'bg-ide-accent/10 text-ide-accent'
                  : 'text-ide-text hover:bg-ide-bg/40'
              }`}
            >
              <div className="text-xs font-medium">{item.title}</div>
              <div className="text-[10px] text-ide-text-dim mt-0.5 leading-relaxed">{item.summary}</div>
              {item.tags && item.tags.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {item.tags.slice(0, 4).map((tag) => (
                    <span key={`${item.id}-${tag}`} className="text-[9px] px-1.5 py-0.5 rounded border border-ide-border/70 text-ide-text-dim">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </button>
          ))}
          {sectionResults.length === 0 && (
            <div className="px-3 py-5 text-[11px] text-ide-text-dim">No help matches for "{search}".</div>
          )}
        </div>
      </div>

      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        <div className="px-4 py-3 border-b border-ide-border bg-ide-sidebar">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold text-ide-text">{section.title}</div>
            {section.status === 'coming_soon' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                COMING SOON
              </span>
            )}
          </div>
          <div className="text-xs text-ide-text-dim mt-1">{section.summary}</div>
          {section.tags && section.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {section.tags.map((tag) => (
                <span key={`${section.id}-${tag}`} className="text-[10px] px-1.5 py-0.5 rounded border border-ide-border text-ide-text-dim">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="rounded-lg border border-ide-border bg-ide-panel p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ide-text-dim mb-2">How It Works</div>
            <div className="space-y-2 prose prose-sm text-xs text-ide-text-dim">
              {section.details.map((line, index) => (
                <div
                  key={`${section.id}-detail-${index}`}
                  className="prose prose-sm max-w-none [&_a]:text-ide-accent [&_a]:underline [&_a]:hover:text-ide-accent/80 [&_strong]:text-ide-text [&_em]:italic [&_code]:text-ide-text-dim [&_code]:bg-ide-bg/50 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_p]:m-0 [&_ul]:m-0 [&_ol]:m-0 [&_li]:m-0"
                >
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <p className="text-xs leading-relaxed text-ide-text-dim">{children}</p>,
                      a: ({ href, children }) => (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="text-ide-accent underline hover:text-ide-accent/80 cursor-pointer">
                          {children}
                        </a>
                      ),
                      strong: ({ children }) => <strong className="text-ide-text font-semibold">{children}</strong>,
                      em: ({ children }) => <em className="italic text-ide-text-dim">{children}</em>,
                      code: ({ children }) => <code className="text-ide-text-dim bg-ide-bg/50 px-1 py-0.5 rounded font-mono text-[11px]">{children}</code>,
                      ul: ({ children }) => <ul className="list-disc list-inside text-xs ml-2">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal list-inside text-xs ml-2">{children}</ol>,
                      li: ({ children }) => <li className="text-xs text-ide-text-dim">{children}</li>,
                      h1: ({ children }) => <h1 className="text-sm font-bold text-ide-text mt-3 mb-1">{children}</h1>,
                      h2: ({ children }) => <h2 className="text-sm font-bold text-ide-text mt-2 mb-1">{children}</h2>,
                      h3: ({ children }) => <h3 className="text-xs font-bold text-ide-text mt-2 mb-1">{children}</h3>,
                      blockquote: ({ children }) => (
                        <blockquote className="border-l-2 border-ide-accent pl-2 italic text-ide-text-dim text-xs">{children}</blockquote>
                      ),
                    }}
                  >
                    {line}
                  </ReactMarkdown>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-ide-text-dim">Controls In This Section</div>
              <div className="text-[10px] text-ide-text-dim">{controls.length} control{controls.length === 1 ? '' : 's'}</div>
            </div>

            {controls.map((anchor) => (
              <div
                key={anchor.id}
                className={`rounded-lg border p-3 transition-colors ${
                  selectedHelpId === anchor.id ? 'border-ide-accent bg-ide-accent/10' : 'border-ide-border bg-ide-panel'
                }`}
              >
                <div className="flex items-start gap-2">
                  <BookOpen className="w-3.5 h-3.5 text-ide-accent mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-ide-text">{anchor.label}</div>
                    <div className="text-[11px] text-ide-text-dim mt-1">{anchor.quickTip}</div>
                    <div className="text-[10px] text-ide-text-dim mt-1">
                      Anchor: <span className="font-mono">{anchor.id}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => goToControl(anchor.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-ide-border text-xs text-ide-text hover:border-ide-accent hover:text-ide-accent transition-colors"
                  >
                    <Crosshair className="w-3 h-3" />
                    Jump To Control
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedHelpId(anchor.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-ide-border text-xs text-ide-text-dim hover:text-ide-text transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Focus Help Entry
                   </button>
                 </div>
               </div>
             ))}
 
             {controls.length === 0 && (
               <div className="rounded-lg border border-ide-border bg-ide-panel p-3 text-xs text-ide-text-dim">
                 No controls matched this filter.
               </div>
             )}
           </div>
         </div>
       </div>
     </div>
   );
 }
