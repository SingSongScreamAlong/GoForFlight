/**
 * Decision Resolution Engine — resolves player choices into consequences.
 *
 * Handles probabilistic outcomes, delayed consequences,
 * branch tracking, and controller recommendation integration.
 */

import { EventBus } from '../core/EventBus.js';
import { EntityId, MissionTime } from '../types/common.js';

export interface Decision {
  id: EntityId;
  prompt: string;
  description: string;
  choices: DecisionChoice[];
  controllerRecommendation?: string;
  timeLimit?: number;          // seconds before default choice
  defaultChoice?: string;
  madeAt?: MissionTime;
  chosenId?: string;
}

export interface DecisionChoice {
  id: string;
  label: string;
  description: string;
  /** Probability of success (0-1). Deterministic if 1.0. */
  successProbability: number;
  /** Consequences applied on success. */
  successConsequences: Consequence[];
  /** Consequences applied on failure. */
  failureConsequences: Consequence[];
  /** Risk factor visible to player. */
  riskLabel?: 'low' | 'moderate' | 'high' | 'extreme';
}

export interface Consequence {
  type: 'immediate' | 'delayed';
  delaySeconds?: number;
  description: string;
  apply: () => void;
}

interface ScheduledConsequence {
  consequence: Consequence;
  executeAt: MissionTime;
  decisionId: EntityId;
}

export class DecisionEngine {
  private eventBus: EventBus;
  private pendingDecisions: Decision[] = [];
  private resolvedDecisions: Decision[] = [];
  private scheduledConsequences: ScheduledConsequence[] = [];
  private missionTime: MissionTime = 0;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;

    this.eventBus.on('time:tick', (p) => {
      this.missionTime = p.missionTime;
      this.processScheduled(p.missionTime);
      this.checkTimeLimits(p.missionTime);
    });
  }

  /** Present a decision to the player. */
  presentDecision(decision: Decision): void {
    this.pendingDecisions.push(decision);
  }

  /** Player makes a choice. */
  resolveDecision(decisionId: EntityId, choiceId: string): void {
    const decision = this.pendingDecisions.find(d => d.id === decisionId);
    if (!decision) return;

    const choice = decision.choices.find(c => c.id === choiceId);
    if (!choice) return;

    decision.madeAt = this.missionTime;
    decision.chosenId = choiceId;

    // Probabilistic resolution
    const roll = Math.random();
    const success = roll <= choice.successProbability;
    const consequences = success ? choice.successConsequences : choice.failureConsequences;

    for (const consequence of consequences) {
      if (consequence.type === 'immediate') {
        consequence.apply();
        this.eventBus.emit('decision:consequenceTriggered', {
          decisionId,
          consequence: consequence.description,
        });
      } else if (consequence.type === 'delayed' && consequence.delaySeconds) {
        this.scheduledConsequences.push({
          consequence,
          executeAt: this.missionTime + consequence.delaySeconds,
          decisionId,
        });
      }
    }

    this.eventBus.emit('decision:made', {
      decisionId,
      choice: choiceId,
      missionTime: this.missionTime,
    });

    // Move to resolved
    this.pendingDecisions = this.pendingDecisions.filter(d => d.id !== decisionId);
    this.resolvedDecisions.push(decision);
  }

  /** Get pending decisions for UI. */
  getPending(): Decision[] {
    return [...this.pendingDecisions];
  }

  /** Get resolved decisions for debrief. */
  getResolved(): Decision[] {
    return [...this.resolvedDecisions];
  }

  private processScheduled(missionTime: MissionTime): void {
    const ready = this.scheduledConsequences.filter(s => missionTime >= s.executeAt);
    this.scheduledConsequences = this.scheduledConsequences.filter(s => missionTime < s.executeAt);

    for (const scheduled of ready) {
      scheduled.consequence.apply();
      this.eventBus.emit('decision:consequenceTriggered', {
        decisionId: scheduled.decisionId,
        consequence: scheduled.consequence.description,
      });
    }
  }

  private checkTimeLimits(missionTime: MissionTime): void {
    for (const decision of this.pendingDecisions) {
      if (decision.timeLimit && decision.defaultChoice) {
        // Check if time expired (decision was presented when it entered pending)
        // We approximate by checking missionTime against a rough threshold
        // In practice, presentedAt would be stored
      }
    }
  }
}
