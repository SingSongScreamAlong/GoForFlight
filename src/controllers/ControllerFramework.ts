/**
 * Controller Role Framework — makes the room feel alive.
 *
 * Each controller owns a domain, has personality, trust state,
 * risk tolerance, and generates recommendations based on their view.
 */

import { EventBus } from '../core/EventBus.js';
import { SimulationManager } from '../core/SimulationManager.js';
import { EntityId, Fraction, GoNoGo, Severity, Subsystem, Status } from '../types/common.js';
import { ControllerDefinition } from '../types/mission.js';

export interface ControllerState {
  id: EntityId;
  name: string;
  callsign: string;
  subsystem: Subsystem;
  trustInPlayer: Fraction;
  trustInCrew: Fraction;
  riskTolerance: Fraction;
  confidenceStyle: 'cautious' | 'balanced' | 'aggressive';
  frustration: Fraction;
  deference: Fraction;
  currentAssessment: GoNoGo;
  lastRecommendation?: string;
  accuracyHistory: boolean[];    // recent right/wrong calls
  ignoredCount: number;          // how many times player ignored their advice
}

export class ControllerFramework {
  private eventBus: EventBus;
  private simulation: SimulationManager;
  private controllers = new Map<EntityId, ControllerState>();

  constructor(eventBus: EventBus, simulation: SimulationManager) {
    this.eventBus = eventBus;
    this.simulation = simulation;

    // Controllers react to subsystem changes
    this.eventBus.on('subsystem:statusChanged', (p) => {
      this.onSubsystemChange(p.subsystem, p.to);
    });
  }

  /** Initialize controllers from mission definition. */
  initFromRoster(roster: ControllerDefinition[]): void {
    this.controllers.clear();
    for (const def of roster) {
      this.controllers.set(def.id, {
        id: def.id,
        name: def.name,
        callsign: def.callsign,
        subsystem: def.subsystem,
        trustInPlayer: def.baseTrust,
        trustInCrew: 0.7,
        riskTolerance: def.riskTolerance,
        confidenceStyle: def.confidenceStyle,
        frustration: 0,
        deference: def.baseTrust * 0.8,
        currentAssessment: GoNoGo.Go,
        accuracyHistory: [],
        ignoredCount: 0,
      });
    }
  }

  /** Get a controller by ID. */
  getController(id: EntityId): ControllerState | undefined {
    return this.controllers.get(id);
  }

  /** Get all controllers. */
  getAll(): ControllerState[] {
    return Array.from(this.controllers.values());
  }

  /** Get controller for a given subsystem. */
  getBySubsystem(subsystem: Subsystem): ControllerState | undefined {
    return Array.from(this.controllers.values()).find(c => c.subsystem === subsystem);
  }

  /** Record that the player followed/ignored a recommendation. */
  recordPlayerResponse(controllerId: EntityId, followed: boolean): void {
    const ctrl = this.controllers.get(controllerId);
    if (!ctrl) return;

    if (followed) {
      ctrl.trustInPlayer = Math.min(1, ctrl.trustInPlayer + 0.05);
      ctrl.frustration = Math.max(0, ctrl.frustration - 0.1);
      ctrl.ignoredCount = Math.max(0, ctrl.ignoredCount - 1);
    } else {
      ctrl.ignoredCount++;
      ctrl.frustration = Math.min(1, ctrl.frustration + 0.1);

      // Trust drops faster after repeated ignoring
      const trustDrop = 0.05 * (1 + ctrl.ignoredCount * 0.2);
      ctrl.trustInPlayer = Math.max(0, ctrl.trustInPlayer - trustDrop);
    }
  }

  /** Record whether a controller's recommendation turned out to be correct. */
  recordAccuracy(controllerId: EntityId, wasCorrect: boolean): void {
    const ctrl = this.controllers.get(controllerId);
    if (!ctrl) return;

    ctrl.accuracyHistory.push(wasCorrect);
    if (ctrl.accuracyHistory.length > 10) ctrl.accuracyHistory.shift();
  }

  /** Get controller's GO/NO-GO vote based on their subsystem and personality. */
  getVote(controllerId: EntityId): { vote: GoNoGo; reason?: string; confidence: number } {
    const ctrl = this.controllers.get(controllerId);
    if (!ctrl) return { vote: GoNoGo.Standby, confidence: 0 };

    const sim = this.simulation.getSubsystem(ctrl.subsystem);
    if (!sim) return { vote: GoNoGo.Go, confidence: 0.5 };

    const state = sim.getState();

    // Base assessment from subsystem status
    let vote = GoNoGo.Go;
    let reason: string | undefined;
    let confidence = 0.8;

    if (state.status === Status.Critical || state.status === Status.Failed) {
      vote = GoNoGo.NoGo;
      reason = `${ctrl.callsign}: ${ctrl.subsystem} is ${state.status}`;
      confidence = 0.95;
    } else if (state.status === Status.Warning) {
      // Personality influences response to warnings
      if (ctrl.confidenceStyle === 'cautious' || ctrl.riskTolerance < 0.4) {
        vote = GoNoGo.NoGo;
        reason = `${ctrl.callsign}: ${ctrl.subsystem} showing warning condition`;
        confidence = 0.7;
      } else {
        vote = GoNoGo.Go;
        reason = `${ctrl.callsign}: ${ctrl.subsystem} has warning but within tolerance`;
        confidence = 0.5;
      }
    } else if (state.status === Status.Caution) {
      if (ctrl.confidenceStyle === 'cautious') {
        vote = GoNoGo.Standby;
        reason = `${ctrl.callsign}: monitoring caution on ${ctrl.subsystem}`;
        confidence = 0.6;
      } else {
        vote = GoNoGo.Go;
        confidence = 0.75;
      }
    }

    // Active faults reduce confidence
    if (state.faults.length > 0) {
      confidence *= 0.7;
      if (state.faults.some(f => !f.hidden)) {
        vote = vote === GoNoGo.Go ? GoNoGo.Standby : vote;
      }
    }

    ctrl.currentAssessment = vote;
    return { vote, reason, confidence };
  }

  /** Generate a recommendation based on current conditions. */
  generateRecommendation(controllerId: EntityId): {
    message: string;
    urgency: Severity;
    action?: string;
  } | null {
    const ctrl = this.controllers.get(controllerId);
    if (!ctrl) return null;

    const sim = this.simulation.getSubsystem(ctrl.subsystem);
    if (!sim) return null;

    const state = sim.getState();

    // No recommendation needed for nominal
    if (state.status === Status.Nominal) return null;

    let message: string;
    let urgency: Severity;
    let action: string | undefined;

    switch (state.status) {
      case Status.Advisory:
        message = `${ctrl.callsign}: Watching a trend on ${ctrl.subsystem}. No action needed yet.`;
        urgency = Severity.Info;
        break;

      case Status.Caution:
        if (ctrl.confidenceStyle === 'cautious') {
          message = `${ctrl.callsign}: Recommend we take a closer look at ${ctrl.subsystem}. Values are drifting.`;
          action = 'investigate';
        } else {
          message = `${ctrl.callsign}: ${ctrl.subsystem} showing caution. Monitoring closely.`;
        }
        urgency = Severity.Caution;
        break;

      case Status.Warning:
        message = `${ctrl.callsign}: ${ctrl.subsystem} is in WARNING. Recommend immediate action.`;
        urgency = Severity.Warning;
        action = state.faults.length > 0 ? 'run_procedure' : 'investigate';

        if (ctrl.frustration > 0.5 && ctrl.ignoredCount > 2) {
          message += ` Flight, I've flagged this ${ctrl.ignoredCount} times now.`;
        }
        break;

      case Status.Critical:
      case Status.Failed:
        message = `${ctrl.callsign}: ${ctrl.subsystem} CRITICAL. We need to act NOW.`;
        urgency = Severity.Critical;
        action = 'emergency_procedure';

        if (ctrl.riskTolerance < 0.3) {
          message += ' Recommend abort consideration.';
        }
        break;

      default:
        return null;
    }

    // Trust modifies how insistently they speak
    if (ctrl.trustInPlayer < 0.3) {
      message += ' ...if you think that matters.';
    }

    ctrl.lastRecommendation = message;

    this.eventBus.emit('controller:recommendation', {
      controllerId: ctrl.id,
      subsystem: ctrl.subsystem,
      message,
      urgency,
    });

    return { message, urgency, action };
  }

  private onSubsystemChange(subsystem: Subsystem, newStatus: Status): void {
    const ctrl = this.getBySubsystem(subsystem);
    if (!ctrl) return;

    // Auto-generate recommendation on status changes
    if (newStatus !== Status.Nominal) {
      this.generateRecommendation(ctrl.id);
    }
  }
}
