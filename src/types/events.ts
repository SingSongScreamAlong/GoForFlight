/**
 * Event type definitions for the global event bus.
 *
 * Every event that flows through the system is typed here.
 * This is the contract between all subsystems.
 */

import {
  EntityId,
  GameState,
  GoNoGo,
  MissionPhase,
  MissionTime,
  ObjectiveStatus,
  Severity,
  Status,
  Subsystem,
} from './common.js';

// ── Event map: event name → payload type ──────────────────────────

export interface GameEventMap {
  // Game state
  'game:stateChanged': { from: GameState; to: GameState };
  'game:saved': { slotId: string; timestamp: number };
  'game:loaded': { slotId: string };

  // Mission lifecycle
  'mission:loaded': { missionId: EntityId };
  'mission:started': { missionId: EntityId };
  'mission:completed': { missionId: EntityId; success: boolean };
  'mission:aborted': { missionId: EntityId; reason: string };

  // Phase progression
  'phase:changed': { from: MissionPhase; to: MissionPhase; missionTime: MissionTime };
  'phase:countdown': { secondsRemaining: number };

  // Time control
  'time:paused': { missionTime: MissionTime };
  'time:resumed': { missionTime: MissionTime; timeScale: number };
  'time:scaleChanged': { timeScale: number };
  'time:tick': { dt: number; missionTime: MissionTime; realTime: number };

  // Subsystem state
  'subsystem:statusChanged': {
    subsystem: Subsystem;
    from: Status;
    to: Status;
    reason?: string;
  };
  'subsystem:valueChanged': {
    subsystem: Subsystem;
    parameter: string;
    value: number;
    previousValue: number;
  };

  // Alerts
  'alert:created': {
    alertId: EntityId;
    subsystem: Subsystem;
    severity: Severity;
    message: string;
    missionTime: MissionTime;
  };
  'alert:escalated': { alertId: EntityId; from: Severity; to: Severity };
  'alert:acknowledged': { alertId: EntityId };
  'alert:resolved': { alertId: EntityId };

  // Anomalies
  'anomaly:spawned': { anomalyId: EntityId; hidden: boolean };
  'anomaly:detected': { anomalyId: EntityId; subsystem: Subsystem };
  'anomaly:escalated': { anomalyId: EntityId; level: number };
  'anomaly:resolved': { anomalyId: EntityId };
  'anomaly:cascaded': { sourceId: EntityId; targetSubsystem: Subsystem };

  // Commands
  'command:issued': { commandId: EntityId; type: string; target: Subsystem | 'mission' };
  'command:executed': { commandId: EntityId; success: boolean };
  'command:failed': { commandId: EntityId; reason: string };

  // Procedures
  'procedure:started': { procedureId: EntityId; name: string };
  'procedure:stepCompleted': { procedureId: EntityId; stepIndex: number };
  'procedure:completed': { procedureId: EntityId; success: boolean };
  'procedure:aborted': { procedureId: EntityId };

  // Flight rules
  'flightRule:violated': { ruleId: EntityId; subsystem: Subsystem; description: string };
  'flightRule:cleared': { ruleId: EntityId };

  // GO/NO-GO
  'poll:started': { phase: MissionPhase };
  'poll:vote': { controllerId: EntityId; vote: GoNoGo; reason?: string };
  'poll:completed': { result: GoNoGo; holdReason?: string };

  // Controllers
  'controller:recommendation': {
    controllerId: EntityId;
    subsystem: Subsystem;
    message: string;
    urgency: Severity;
  };
  'controller:dialogue': {
    controllerId: EntityId;
    text: string;
    type: 'callout' | 'confirmation' | 'warning' | 'disagreement' | 'escalation';
  };

  // Crew
  'crew:report': { crewId: EntityId; message: string; reliable: boolean };
  'crew:taskAssigned': { crewId: EntityId; taskId: EntityId };
  'crew:taskCompleted': { crewId: EntityId; taskId: EntityId; success: boolean };

  // Objectives
  'objective:statusChanged': {
    objectiveId: EntityId;
    from: ObjectiveStatus;
    to: ObjectiveStatus;
  };

  // Decisions
  'decision:made': { decisionId: EntityId; choice: string; missionTime: MissionTime };
  'decision:consequenceTriggered': { decisionId: EntityId; consequence: string };
}

/** Union of all event names */
export type GameEventName = keyof GameEventMap;

/** Payload for a given event name */
export type GameEventPayload<E extends GameEventName> = GameEventMap[E];
