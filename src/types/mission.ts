/**
 * Mission definition schema — how missions are authored and stored.
 */

import {
  EntityId,
  Fraction,
  MissionPhase,
  MissionTime,
  ObjectiveStatus,
  Severity,
  Subsystem,
  ValueRange,
} from './common.js';

// ── Mission definition (authored content) ─────────────────────────

export interface MissionDefinition {
  id: EntityId;
  name: string;
  description: string;
  briefing: MissionBriefing;
  phases: PhaseDefinition[];
  objectives: ObjectiveDefinition[];
  crewManifest: CrewMemberDefinition[];
  controllerRoster: ControllerDefinition[];
  anomalyPool: EntityId[];
  scriptedEvents: ScriptedEventDefinition[];
  successConditions: ConditionDefinition[];
  failureConditions: ConditionDefinition[];
  unlockConditions?: ConditionDefinition[];
  initialSubsystemStates: Record<Subsystem, SubsystemInitialState>;
  difficulty: MissionDifficultySettings;
}

export interface MissionBriefing {
  overview: string;
  goals: string[];
  vehicleNotes: string;
  crewNotes: string;
  knownRisks: string[];
  publicStakes?: string;
}

export interface PhaseDefinition {
  phase: MissionPhase;
  durationSeconds: number;
  description: string;
  autoAdvance: boolean;
  advanceConditions?: ConditionDefinition[];
  phaseRules?: EntityId[];
}

export interface ObjectiveDefinition {
  id: EntityId;
  name: string;
  description: string;
  type: 'primary' | 'secondary' | 'hidden' | 'optional_risk';
  initialStatus: ObjectiveStatus;
  successConditions: ConditionDefinition[];
  failureConditions?: ConditionDefinition[];
  phaseRequired?: MissionPhase;
  reward?: string;
}

export interface CrewMemberDefinition {
  id: EntityId;
  name: string;
  role: string;
  baseFatigue: Fraction;
  baseStress: Fraction;
  baseTrust: Fraction;
  strengths: string[];
  personality: string;
}

export interface ControllerDefinition {
  id: EntityId;
  name: string;
  callsign: string;
  subsystem: Subsystem;
  baseTrust: Fraction;
  riskTolerance: Fraction;
  confidenceStyle: 'cautious' | 'balanced' | 'aggressive';
  personality: string;
}

export interface ScriptedEventDefinition {
  id: EntityId;
  triggerTime?: MissionTime;
  triggerPhase?: MissionPhase;
  triggerCondition?: ConditionDefinition;
  eventType: 'dialogue' | 'anomaly' | 'narrative' | 'phase_change' | 'objective_update';
  payload: Record<string, unknown>;
  once: boolean;
}

export interface ConditionDefinition {
  type: 'time' | 'phase' | 'subsystem_status' | 'parameter_value' | 'objective_status'
    | 'anomaly_active' | 'crew_state' | 'compound_and' | 'compound_or';
  params: Record<string, unknown>;
}

export interface SubsystemInitialState {
  parameters: Record<string, number>;
  nominalRanges: Record<string, ValueRange>;
}

export interface MissionDifficultySettings {
  anomalyFrequency: Fraction;
  anomalyAmbiguity: Fraction;
  cascadeSpeed: Fraction;
  resourceMargins: Fraction;
  controllerHintQuality: Fraction;
}

// ── Runtime mission state (what gets saved) ───────────────────────

export interface MissionRuntimeState {
  missionId: EntityId;
  currentPhase: MissionPhase;
  phaseIndex: number;
  missionTimeElapsed: MissionTime;
  objectives: Map<EntityId, ObjectiveStatus>;
  activeAnomalies: EntityId[];
  resolvedAnomalies: EntityId[];
  activeAlerts: EntityId[];
  activeProcedures: EntityId[];
  decisionLog: DecisionLogEntry[];
  branchState: Map<string, string>;
}

export interface DecisionLogEntry {
  id: EntityId;
  missionTime: MissionTime;
  description: string;
  choice: string;
  alternatives: string[];
  consequencesTriggered: string[];
}
