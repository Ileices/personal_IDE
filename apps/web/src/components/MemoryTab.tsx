// apps/web/src/components/MemoryTab.tsx
// ============================================
// Unified Memory Tab - Consolidated display for all agent memory
// ============================================
import React, { useState, useEffect, useMemo } from 'react';
import { useProjectStore } from '../stores/projectStore';
import { useChatStore } from '../stores/chatStore';
import { MemoryAccessBar } from './memory/MemoryAccessBar';
import { AgentEventFeed } from './agent/AgentEventFeed';
import { Tag, Filter, Search, ChevronDown, ChevronUp } from 'lucide-react';
import type { MemoryAccessMode, MemorySource, UnifiedMemoryEvent } from './memory/types';

// Define memory sources (agents, LLM interactions)
const MEMORY_SOURCES: MemorySource[] = [
  { id: 'god_factory', label: 'God Factory', icon: <Brain size={16} /> },
  { id: 'chat_agent', label: 'Chat Agent', icon: <MessageSquare size={16} /> },
  { id: 'agent_loop', label: 'Agent Loop', icon: <Cpu size={16} /> },
  { id: 'fleet', label: 'Fleet Agents', icon: <Server size={16} /> },
  { id: 'midwife', label: 'Midwife Bird-Feeding', icon: <Database size={16} /> },
  { id: 'help_agent', label: 'Help Agent', icon: <HelpCircle size={16} /> },
  { id: 'ask_chat', label: 'Ask Chat', icon: <MessageSquare size={16} /> },
  { id: 'edit_chat', label: 'Edit Chat', icon: <Edit3 size={16} /> },
  { id: 'plan_chat', label: 'Plan Chat', icon: <List size={16} /> },
];

export function MemoryTab() {
  const { activeProject } = useProjectStore();
  const { conversationId } = useChatStore();
  const [events, setEvents] = useState<UnifiedMemoryEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [accessMode, setAccessMode] = useState<MemoryAccessMode>('total');
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);

  // Fetch unified memory from backend
  useEffect(() => {
    if (!activeProject?.id) return;
    setLoading(true);
    fetch(`${API_BASE}/memory/unified?projectId=${activeProject.id}&accessMode=${accessMode}`)
      .then((res) => res.json())
      .then((data) => {
        setEvents(data.events);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [activeProject?.id, accessMode]);

  // Filter events by source and search query
  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      const matchesSource = selectedSources.length === 0 || selectedSources.includes(event.source);
      const matchesQuery = searchQuery === '' || 
        event.tags.some((tag) => tag.includes(searchQuery)) ||
        event.description.includes(searchQuery);
      return matchesSource && matchesQuery;
    });
  }, [events, selectedSources, searchQuery]);

  // Toggle source selection
  const toggleSource = (sourceId: string) => {
    setSelectedSources((prev) =>
      prev.includes(sourceId)
        ? prev.filter((id) => id !== sourceId)
        : [...prev, sourceId]
    );
  };

  return (
    <div className="memory-tab">
      <div className="memory-header">
        <h2>Unified Memory</h2>
        <MemoryAccessBar
          accessMode={accessMode}
          setAccessMode={setAccessMode}
        />
      </div>

      <div className="memory-controls">
        <div className="source-filters">
          {MEMORY_SOURCES.map((source) => (
            <button
              key={source.id}
              className={`source-filter ${selectedSources.includes(source.id) ? 'active' : ''}`}
              onClick={() => toggleSource(source.id)}
            >
              {source.icon} {source.label}
            </button>
          ))}
        </div>
        <div className="search-box">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search tags or content..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="memory-events">
        {loading ? (
          <div className="loading">
            <Loader2 className="animate-spin" /> Loading memory...
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="empty-state">No memory events found.</div>
        ) : (
          <div className="event-list">
            {filteredEvents.map((event) => (
              <div
                key={event.id}
                className={`memory-event ${expandedEvent === event.id ? 'expanded' : ''}`}
              >
                <div className="event-header" onClick={() => setExpandedEvent(expandedEvent === event.id ? null : event.id)}>
                  <div className="event-source">
                    {MEMORY_SOURCES.find((s) => s.id === event.source)?.icon}
                    <span>{MEMORY_SOURCES.find((s) => s.id === event.source)?.label}</span>
                  </div>
                  <div className="event-tags">
                    {event.tags.map((tag) => (
                      <span key={tag} className="tag"><Tag size={12} /> {tag}</span>
                    ))}
                  </div>
                  <div className="event-toggle">
                    {expandedEvent === event.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>
                {expandedEvent === event.id && (
                  <div className="event-details">
                    <div className="event-description">{event.description}</div>
                    <div className="event-meta">
                      <span>Cycle: {event.cycleId}</span>
                      <span>Timestamp: {new Date(event.timestamp).toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}