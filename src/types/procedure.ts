/**
 * Procedure system schemas.
 */

import { EntityId, Subsystem } from './common.js';
import { ConditionDefinition } from './mission.js';

export type ProcedureCategory = 'nominal' | 'off_nominal' | 'contingency' | 'emergency' | 'mission_specific';

export interface ProcedureDefinition {
  id: EntityId;
  name: string;
  category: ProcedureCategory;
  description: string;
  ownerSubsystem: Subsystem;
  steps: ProcedureStep[];
  applicableAnomalies?: EntityId[];
}

export interface ProcedureStep {
  index: number;
  instruction: string;
  explanation?: string;
  whyItMatters?: string;
  expectedResult?: string;
  consequenceOfSkipping?: string;
  assignee: 'ground' | 'crew' | 'auto';
  requiresConfirmation: boolean;
  effects?: ProcedureEffect[];
  branches?: ProcedureBranch[];
  dependencies?: number[];       // step indices that must complete first
  warningNote?: string;
}

export interface ProcedureEffect {
  subsystem: Subsystem;
  parameter: string;
  operation: 'set' | 'add' | 'multiply';
  value: number;
}

export interface ProcedureBranch {
  label: string;
  condition?: ConditionDefinition;
  gotoStep: number;
}

export interface ProcedureRuntimeState {
  definitionId: EntityId;
  currentStepIndex: number;
  completedSteps: number[];
  skippedSteps: number[];
  branchPath: number[];
  started: boolean;
  completed: boolean;
  aborted: boolean;
}
