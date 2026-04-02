/**
 * Anomaly system schemas.
 */

import { EntityId, MissionPhase, MissionTime, Severity, Subsystem } from './common.js';
import { ConditionDefinition } from './mission.js';

export interface AnomalyDefinition {
  id: EntityId;
  name: string;
  description: string;
  category: 'sensor' | 'mechanical' | 'environmental' | 'human' | 'software';
  triggerConditions: ConditionDefinition[];
  visibleSymptoms: AnomalySymptom[];
  hiddenParameters: Record<string, number>;
  escalationPath: EscalationStep[];
  affectedSubsystems: Subsystem[];
  recommendedProcedures: EntityId[];
  possibleMisdiagnoses: EntityId[];
  resolutionStates: string[];
  difficultyWeight: number;
  allowedPhases: MissionPhase[];
}

export interface AnomalySymptom {
  subsystem: Subsystem;
  parameter: string;
  effect: 'offset' | 'drift' | 'spike' | 'oscillation' | 'flatline' | 'noise';
  magnitude: number;
  delaySeconds: number;
  confidenceToDetect: number;
}

export interface EscalationStep {
  level: number;
  delaySeconds: number;
  description: string;
  newSymptoms?: AnomalySymptom[];
  severityAtLevel: Severity;
  cascadeTargets?: CascadeTarget[];
}

export interface CascadeTarget {
  subsystem: Subsystem;
  effect: string;
  magnitude: number;
  delay: number;
}

export interface AnomalyRuntimeState {
  definitionId: EntityId;
  spawnTime: MissionTime;
  currentLevel: number;
  detected: boolean;
  detectedTime?: MissionTime;
  resolved: boolean;
  resolvedTime?: MissionTime;
  activeSymptoms: AnomalySymptom[];
  cascadesTriggered: EntityId[];
}
