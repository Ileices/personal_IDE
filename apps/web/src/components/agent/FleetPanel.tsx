// ============================================
// FleetPanel — Standalone fleet view for SidePanel
// Wires up fleetStore → FleetControls
// ============================================
import React from 'react';
import { useFleetStore } from '../../stores/fleetStore';
import { FleetControls } from './FleetControls';

export function FleetPanel() {
  const {
    agents, isFleetRunning,
    pauseAgent, resumeAgent, stopAgent,
  } = useFleetStore();

  if (agents.length === 0) {
    return (
      <div className="p-3 text-xs text-ide-text-dim space-y-2">
        <p className="font-medium text-ide-text">No fleet agents running.</p>
        <p>Start a fleet run from the Agent panel using the "Fleet Mode" toggle.</p>
      </div>
    );
  }

  return (
    <FleetControls
      fleetAgents={agents}
      isFleetRunning={isFleetRunning}
      pendingQuestions={[]}
      pauseAgent={pauseAgent}
      resumeAgent={resumeAgent}
      stopAgent={stopAgent}
      sendFleetMessage={() => {}}
      answerQuestion={() => {}}
    />
  );
}
