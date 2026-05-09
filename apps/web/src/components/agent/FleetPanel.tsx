// ============================================
// FleetPanel — Standalone fleet view for SidePanel
// Wires up fleetStore → FleetControls
// ============================================
import React, { useEffect } from 'react';
import { useFleetStore } from '../../stores/fleetStore';
import { FleetControls } from './FleetControls';

export function FleetPanel() {
  const {
    agents, isFleetRunning,
    pauseAgent, resumeAgent, stopAgent,
    sendFleetMessage, answerQuestion,
    fleetConnectionState, restoreFleetState, connectFleetEvents, disconnectFleetEvents,
  } = useFleetStore();

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      await restoreFleetState();
      if (!cancelled) connectFleetEvents();
    })();

    return () => {
      cancelled = true;
      disconnectFleetEvents();
    };
  }, [restoreFleetState, connectFleetEvents, disconnectFleetEvents]);

  if (agents.length === 0) {
    return (
      <div className="p-3 text-xs text-ide-text-dim space-y-2">
        <p className="font-medium text-ide-text">No fleet agents running.</p>
        <p>Start a fleet run from the Agent panel using the "Fleet Mode" toggle.</p>
        {fleetConnectionState === 'recovered' && (
          <p className="rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-cyan-200">
            Recovered fleet state from the server. Waiting for live SSE updates.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {fleetConnectionState === 'recovered' && (
        <div className="mx-3 mt-2 rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[10px] text-cyan-200">
          Recovered fleet state from the server. Waiting for live SSE updates.
        </div>
      )}
      {fleetConnectionState === 'live' && (
        <div className="mx-3 mt-2 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-200">
          Live fleet stream connected.
        </div>
      )}
      <FleetControls
        fleetAgents={agents}
        isFleetRunning={isFleetRunning}
        pendingQuestions={[]}
        pauseAgent={pauseAgent}
        resumeAgent={resumeAgent}
        stopAgent={stopAgent}
        sendFleetMessage={sendFleetMessage}
        answerQuestion={answerQuestion}
      />
    </div>
  );
}
