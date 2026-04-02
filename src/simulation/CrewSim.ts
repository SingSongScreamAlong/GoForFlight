/**
 * Crew state subsystem simulation.
 *
 * Models: fatigue, stress, trust, cognitive performance, health,
 * task success probability, response delay, panic thresholds.
 */

import { Subsystem, Status, MissionTime, Fraction } from '../types/common.js';
import { BaseSubsystem } from './BaseSubsystem.js';

export interface CrewMember {
  id: string;
  name: string;
  role: string;
  fatigue: Fraction;
  stress: Fraction;
  trust: Fraction;
  cognitivePerformance: Fraction;
  health: 'healthy' | 'symptomatic' | 'impaired' | 'incapacitated';
  symptoms: string[];
  responseDelay: number;          // multiplier (1.0 = normal)
  taskSuccessProbability: Fraction;
  resting: boolean;
}

export class CrewSim extends BaseSubsystem {
  readonly subsystem = Subsystem.Crew;

  private members: CrewMember[] = [];

  constructor() {
    super();
    this.init(
      {
        avgFatigue: 0.12,
        avgStress: 0.2,
        avgTrust: 0.75,
        avgPerformance: 0.9,
        crewHealthy: 3,
        crewImpaired: 0,
      },
      {
        avgFatigue: { min: 0, max: 1, nominalMin: 0, nominalMax: 0.4, cautionMax: 0.6, warningMax: 0.8 },
        avgStress: { min: 0, max: 1, nominalMin: 0, nominalMax: 0.4, cautionMax: 0.6, warningMax: 0.8 },
        avgPerformance: { min: 0, max: 1, nominalMin: 0.6, nominalMax: 1.0, cautionMin: 0.4, warningMin: 0.2 },
      },
    );
  }

  /** Initialize crew from mission definition. */
  initCrew(members: Array<{ id: string; name: string; role: string; baseFatigue: number; baseStress: number; baseTrust: number }>): void {
    this.members = members.map(m => ({
      id: m.id,
      name: m.name,
      role: m.role,
      fatigue: m.baseFatigue,
      stress: m.baseStress,
      trust: m.baseTrust,
      cognitivePerformance: 1 - (m.baseFatigue * 0.3 + m.baseStress * 0.3),
      health: 'healthy' as const,
      symptoms: [],
      responseDelay: 1.0,
      taskSuccessProbability: 0.95,
      resting: false,
    }));
  }

  getMember(id: string): CrewMember | undefined {
    return this.members.find(m => m.id === id);
  }

  getMembers(): CrewMember[] { return this.members.map(m => ({ ...m })); }

  /** Order a crew member to rest. */
  orderRest(crewId: string): void {
    const member = this.members.find(m => m.id === crewId);
    if (member) member.resting = true;
  }

  /** Wake a crew member. */
  cancelRest(crewId: string): void {
    const member = this.members.find(m => m.id === crewId);
    if (member) member.resting = false;
  }

  /** External stress event (anomaly, bad news, etc.). */
  applyStressEvent(magnitude: number): void {
    for (const m of this.members) {
      m.stress = Math.min(1, m.stress + magnitude);
    }
  }

  /** Trust change from player decisions. */
  adjustTrust(delta: number): void {
    for (const m of this.members) {
      m.trust = Math.max(0, Math.min(1, m.trust + delta));
    }
  }

  tick(dt: number, missionTime: MissionTime): void {
    this.applyFaults(dt);

    const dtHours = dt / 3600;

    for (const m of this.members) {
      // Fatigue increases over time, decreases while resting
      if (m.resting) {
        m.fatigue = Math.max(0, m.fatigue - 0.05 * dtHours);
        m.stress = Math.max(0, m.stress - 0.03 * dtHours);
      } else {
        m.fatigue = Math.min(1, m.fatigue + 0.02 * dtHours);
      }

      // Stress naturally decays slowly
      m.stress = Math.max(0, m.stress - 0.005 * dtHours);

      // Cognitive performance = f(fatigue, stress)
      m.cognitivePerformance = Math.max(0, 1 - (m.fatigue * 0.4 + m.stress * 0.4));

      // Response delay increases with fatigue and stress
      m.responseDelay = 1 + m.fatigue * 0.5 + m.stress * 0.3;

      // Task success probability
      m.taskSuccessProbability = Math.max(0.1, m.cognitivePerformance * (0.8 + m.trust * 0.2));

      // Health state transitions
      if (m.fatigue > 0.9 || m.stress > 0.9) {
        m.health = 'impaired';
        if (!m.symptoms.includes('exhaustion')) m.symptoms.push('exhaustion');
      } else if (m.fatigue > 0.7 || m.stress > 0.7) {
        m.health = 'symptomatic';
        m.symptoms = m.symptoms.filter(s => s !== 'exhaustion');
        if (!m.symptoms.includes('fatigue')) m.symptoms.push('fatigue');
      } else {
        m.health = 'healthy';
        m.symptoms = [];
      }
    }

    // Update aggregate parameters
    const activeCrew = this.members.filter(m => m.health !== 'incapacitated');
    const avg = (fn: (m: CrewMember) => number) =>
      activeCrew.length > 0 ? activeCrew.reduce((s, m) => s + fn(m), 0) / activeCrew.length : 0;

    this.parameters.set('avgFatigue', avg(m => m.fatigue));
    this.parameters.set('avgStress', avg(m => m.stress));
    this.parameters.set('avgTrust', avg(m => m.trust));
    this.parameters.set('avgPerformance', avg(m => m.cognitivePerformance));
    this.parameters.set('crewHealthy', this.members.filter(m => m.health === 'healthy').length);
    this.parameters.set('crewImpaired', this.members.filter(m => m.health === 'impaired' || m.health === 'incapacitated').length);

    this.recordHistory('avgFatigue', missionTime);
    this.recordHistory('avgStress', missionTime);
    this.recordHistory('avgPerformance', missionTime);

    this.deriveStatus();

    // All crew incapacitated = failure
    if (this.members.every(m => m.health === 'incapacitated')) {
      this.status = Status.Failed;
    }
  }
}
