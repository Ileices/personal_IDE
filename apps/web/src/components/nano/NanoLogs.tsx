// ─── NanoLogs — Live process log viewer ───
import React from 'react';
import { Terminal as TerminalIcon } from 'lucide-react';
import { Badge, Section } from '../ui/widgets';

interface Props {
  logs: string[];
  logsRef: React.RefObject<HTMLDivElement | null>;
  isRunning: boolean;
}

export function NanoLogs({ logs, logsRef, isRunning }: Props) {
  return (
    <Section title="Process Logs" icon={TerminalIcon} defaultOpen={isRunning || logs.length > 0} badge={
      logs.length > 0 ? <Badge color="gray">{logs.length} lines</Badge> : null
    }>
      <div
        ref={logsRef}
        className="bg-black/50 rounded p-2 font-mono text-[10px] text-green-300/80 max-h-56 overflow-y-auto leading-relaxed"
        style={{ minHeight: 80 }}
      >
        {logs.length === 0 ? (
          <div className="text-ide-text-dim text-center py-4">
            No logs yet. Start the Nano Sea to see output.
          </div>
        ) : (
          logs.map((line, i) => (
            <div key={i} className={
              line.includes('[ERR]') || line.includes('ERROR') ? 'text-red-400' :
              line.includes('[IDE]') ? 'text-cyan-300' :
              line.includes('SPAWN ERROR') ? 'text-red-500 font-bold' : ''
            }>
              {line}
            </div>
          ))
        )}
      </div>
    </Section>
  );
}
