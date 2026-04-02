/**
 * Procedure Runner — step-by-step execution of procedures.
 *
 * The player's primary tool for working problems.
 * Handles branching, dependencies, assignment, effects, and tracking.
 */

import { EventBus } from '../core/EventBus.js';
import { SimulationManager } from '../core/SimulationManager.js';
import { EntityId, Subsystem } from '../types/common.js';
import {
  ProcedureDefinition,
  ProcedureRuntimeState,
  ProcedureStep,
  ProcedureEffect,
} from '../types/procedure.js';

export class ProcedureRunner {
  private eventBus: EventBus;
  private simulation: SimulationManager;
  private definitions = new Map<EntityId, ProcedureDefinition>();
  private activeProcedures = new Map<EntityId, ProcedureRuntimeState>();

  constructor(eventBus: EventBus, simulation: SimulationManager) {
    this.eventBus = eventBus;
    this.simulation = simulation;
  }

  /** Register procedure definitions. */
  registerProcedure(def: ProcedureDefinition): void {
    this.definitions.set(def.id, def);
  }

  registerAll(defs: ProcedureDefinition[]): void {
    for (const def of defs) this.registerProcedure(def);
  }

  /** Start a procedure. */
  startProcedure(procedureId: EntityId): boolean {
    const def = this.definitions.get(procedureId);
    if (!def) return false;

    if (this.activeProcedures.has(procedureId)) return false; // already running

    const state: ProcedureRuntimeState = {
      definitionId: procedureId,
      currentStepIndex: 0,
      completedSteps: [],
      skippedSteps: [],
      branchPath: [0],
      started: true,
      completed: false,
      aborted: false,
    };

    this.activeProcedures.set(procedureId, state);
    this.eventBus.emit('procedure:started', { procedureId, name: def.name });
    return true;
  }

  /** Complete the current step and advance. */
  completeCurrentStep(procedureId: EntityId): boolean {
    const state = this.activeProcedures.get(procedureId);
    const def = this.definitions.get(procedureId);
    if (!state || !def || state.completed || state.aborted) return false;

    const step = def.steps[state.currentStepIndex];
    if (!step) return false;

    // Check dependencies
    if (step.dependencies) {
      for (const depIdx of step.dependencies) {
        if (!state.completedSteps.includes(depIdx)) {
          return false; // dependency not met
        }
      }
    }

    // Apply step effects
    if (step.effects) {
      this.applyEffects(step.effects);
    }

    state.completedSteps.push(state.currentStepIndex);
    this.eventBus.emit('procedure:stepCompleted', {
      procedureId,
      stepIndex: state.currentStepIndex,
    });

    // Advance to next step
    const nextIndex = this.getNextStepIndex(def, state);
    if (nextIndex === null) {
      // Procedure complete
      state.completed = true;
      this.eventBus.emit('procedure:completed', { procedureId, success: true });
      this.activeProcedures.delete(procedureId);
    } else {
      state.currentStepIndex = nextIndex;
      state.branchPath.push(nextIndex);
    }

    return true;
  }

  /** Skip the current step (if allowed). */
  skipCurrentStep(procedureId: EntityId): boolean {
    const state = this.activeProcedures.get(procedureId);
    const def = this.definitions.get(procedureId);
    if (!state || !def || state.completed || state.aborted) return false;

    const step = def.steps[state.currentStepIndex];
    if (!step || step.requiresConfirmation) return false; // can't skip required steps

    state.skippedSteps.push(state.currentStepIndex);

    const nextIndex = this.getNextStepIndex(def, state);
    if (nextIndex === null) {
      state.completed = true;
      this.eventBus.emit('procedure:completed', { procedureId, success: true });
      this.activeProcedures.delete(procedureId);
    } else {
      state.currentStepIndex = nextIndex;
      state.branchPath.push(nextIndex);
    }

    return true;
  }

  /** Choose a branch at the current step. */
  selectBranch(procedureId: EntityId, branchLabel: string): boolean {
    const state = this.activeProcedures.get(procedureId);
    const def = this.definitions.get(procedureId);
    if (!state || !def) return false;

    const step = def.steps[state.currentStepIndex];
    if (!step?.branches) return false;

    const branch = step.branches.find(b => b.label === branchLabel);
    if (!branch) return false;

    state.completedSteps.push(state.currentStepIndex);
    state.currentStepIndex = branch.gotoStep;
    state.branchPath.push(branch.gotoStep);
    return true;
  }

  /** Abort a running procedure. */
  abortProcedure(procedureId: EntityId): void {
    const state = this.activeProcedures.get(procedureId);
    if (!state) return;

    state.aborted = true;
    this.activeProcedures.delete(procedureId);
    this.eventBus.emit('procedure:aborted', { procedureId });
  }

  /** Get the current step for a running procedure. */
  getCurrentStep(procedureId: EntityId): { step: ProcedureStep; index: number } | null {
    const state = this.activeProcedures.get(procedureId);
    const def = this.definitions.get(procedureId);
    if (!state || !def) return null;

    const step = def.steps[state.currentStepIndex];
    if (!step) return null;

    return { step, index: state.currentStepIndex };
  }

  /** Get all steps with their completion status. */
  getStepStatuses(procedureId: EntityId): Array<{ step: ProcedureStep; status: 'completed' | 'skipped' | 'current' | 'pending' }> {
    const state = this.activeProcedures.get(procedureId);
    const def = this.definitions.get(procedureId);
    if (!def) return [];

    return def.steps.map((step, idx) => ({
      step,
      status: state?.completedSteps.includes(idx) ? 'completed' :
              state?.skippedSteps.includes(idx) ? 'skipped' :
              state?.currentStepIndex === idx ? 'current' : 'pending',
    }));
  }

  /** Get all active procedures. */
  getActive(): Array<{ definition: ProcedureDefinition; state: ProcedureRuntimeState }> {
    return Array.from(this.activeProcedures.entries()).map(([id, state]) => ({
      definition: this.definitions.get(id)!,
      state,
    }));
  }

  /** Get procedure definition by ID. */
  getDefinition(id: EntityId): ProcedureDefinition | undefined {
    return this.definitions.get(id);
  }

  /** Get all procedures for a subsystem. */
  getBySubsystem(subsystem: Subsystem): ProcedureDefinition[] {
    return Array.from(this.definitions.values()).filter(d => d.ownerSubsystem === subsystem);
  }

  private getNextStepIndex(def: ProcedureDefinition, state: ProcedureRuntimeState): number | null {
    const nextIdx = state.currentStepIndex + 1;
    if (nextIdx >= def.steps.length) return null;
    return nextIdx;
  }

  private applyEffects(effects: ProcedureEffect[]): void {
    for (const effect of effects) {
      const sim = this.simulation.getSubsystem(effect.subsystem);
      if (!sim) continue;

      const current = sim.getParameter(effect.parameter) ?? 0;
      switch (effect.operation) {
        case 'set':
          sim.setParameter(effect.parameter, effect.value);
          break;
        case 'add':
          sim.setParameter(effect.parameter, current + effect.value);
          break;
        case 'multiply':
          sim.setParameter(effect.parameter, current * effect.value);
          break;
      }
    }
  }
}
