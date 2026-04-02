/**
 * GO/NO-GO Polling System — the heartbeat of mission control.
 *
 * Polls each controller for their subsystem readiness,
 * integrates with flight rules, generates hold states.
 */

import { EventBus } from '../core/EventBus.js';
import { EntityId, GoNoGo, MissionPhase, Subsystem } from '../types/common.js';
import { FlightRulesEngine } from './FlightRulesEngine.js';

export interface PollVote {
  controllerId: EntityId;
  subsystem: Subsystem;
  callsign: string;
  vote: GoNoGo;
  reason?: string;
  confidence: number; // 0-1
}

export interface PollResult {
  phase: MissionPhase;
  votes: PollVote[];
  result: GoNoGo;
  holdReason?: string;
  timestamp: number;
}

export class GoNoGoPoll {
  private eventBus: EventBus;
  private flightRules: FlightRulesEngine;
  private pollHistory: PollResult[] = [];
  private currentPoll: PollResult | null = null;

  constructor(eventBus: EventBus, flightRules: FlightRulesEngine) {
    this.eventBus = eventBus;
    this.flightRules = flightRules;
  }

  /** Initiate a GO/NO-GO poll for a given phase. */
  startPoll(phase: MissionPhase): void {
    this.currentPoll = {
      phase,
      votes: [],
      result: GoNoGo.Standby,
      timestamp: Date.now(),
    };

    this.eventBus.emit('poll:started', { phase });
  }

  /** Register a controller's vote. */
  submitVote(vote: PollVote): void {
    if (!this.currentPoll) return;

    // Replace existing vote from same controller
    this.currentPoll.votes = this.currentPoll.votes.filter(
      v => v.controllerId !== vote.controllerId
    );
    this.currentPoll.votes.push(vote);

    this.eventBus.emit('poll:vote', {
      controllerId: vote.controllerId,
      vote: vote.vote,
      reason: vote.reason,
    });
  }

  /** Evaluate the poll — all must be GO for GO result. */
  evaluate(): PollResult | null {
    if (!this.currentPoll) return null;

    // Check flight rules first
    if (this.flightRules.hasBlockingViolations()) {
      const violations = this.flightRules.getActiveViolations();
      this.currentPoll.result = GoNoGo.NoGo;
      this.currentPoll.holdReason = `Flight rule violation: ${violations[0]?.rule.description}`;
    } else if (this.currentPoll.votes.some(v => v.vote === GoNoGo.NoGo)) {
      // Any NO-GO blocks
      const noGoVotes = this.currentPoll.votes.filter(v => v.vote === GoNoGo.NoGo);
      this.currentPoll.result = GoNoGo.NoGo;
      this.currentPoll.holdReason = noGoVotes.map(v => `${v.callsign}: ${v.reason ?? 'NO-GO'}`).join('; ');
    } else if (this.currentPoll.votes.some(v => v.vote === GoNoGo.Standby)) {
      this.currentPoll.result = GoNoGo.Standby;
    } else if (this.currentPoll.votes.length > 0) {
      this.currentPoll.result = GoNoGo.Go;
    }

    const result = { ...this.currentPoll };
    this.pollHistory.push(result);

    this.eventBus.emit('poll:completed', {
      result: result.result,
      holdReason: result.holdReason,
    });

    this.currentPoll = null;
    return result;
  }

  /** Get the current in-progress poll. */
  getCurrentPoll(): PollResult | null {
    return this.currentPoll;
  }

  /** Get poll history for debrief. */
  getHistory(): PollResult[] {
    return [...this.pollHistory];
  }
}
