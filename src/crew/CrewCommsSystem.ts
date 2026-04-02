/**
 * Crew Communication System — crew reports, observations,
 * confusion states, delayed responses.
 */

import { EventBus } from '../core/EventBus.js';
import { CrewSim, CrewMember } from '../simulation/CrewSim.js';
import { EntityId, MissionTime, Fraction } from '../types/common.js';

export interface CrewReport {
  id: EntityId;
  crewId: EntityId;
  crewName: string;
  message: string;
  reliable: boolean;
  timestamp: MissionTime;
  type: 'status' | 'symptom' | 'observation' | 'question' | 'confusion';
}

export class CrewCommsSystem {
  private eventBus: EventBus;
  private crewSim: CrewSim;
  private reports: CrewReport[] = [];
  private missionTime = 0;
  private lastReportTime = 0;
  private reportCooldown = 30; // min seconds between unsolicited reports

  constructor(eventBus: EventBus, crewSim: CrewSim) {
    this.eventBus = eventBus;
    this.crewSim = crewSim;

    this.eventBus.on('time:tick', (p) => {
      this.missionTime = p.missionTime;
      this.checkForUnsolicitedReports();
    });

    // Crew reports symptoms from ECLSS issues
    this.eventBus.on('subsystem:statusChanged', (p) => {
      if (p.subsystem === 'eclss' && (p.to === 'warning' || p.to === 'critical')) {
        this.generateSymptomReport();
      }
    });
  }

  /** Request a report from a specific crew member. */
  requestReport(crewId: EntityId): CrewReport | null {
    const member = this.crewSim.getMember(crewId);
    if (!member || member.health === 'incapacitated') return null;

    // Delay based on crew state
    const reliable = member.cognitivePerformance > 0.5;
    const observation = this.generateObservation(member, reliable);

    const report: CrewReport = {
      id: `rpt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      crewId,
      crewName: member.name,
      message: observation,
      reliable,
      timestamp: this.missionTime,
      type: 'observation',
    };

    this.reports.push(report);
    this.eventBus.emit('crew:report', {
      crewId,
      message: observation,
      reliable,
    });

    return report;
  }

  /** Get recent reports. */
  getReports(limit = 20): CrewReport[] {
    return this.reports.slice(-limit);
  }

  /** Get reports from a specific crew member. */
  getReportsFromCrew(crewId: EntityId): CrewReport[] {
    return this.reports.filter(r => r.crewId === crewId);
  }

  private checkForUnsolicitedReports(): void {
    if (this.missionTime - this.lastReportTime < this.reportCooldown) return;

    const members = this.crewSim.getMembers();
    for (const member of members) {
      if (member.health === 'incapacitated') continue;

      // Crew with symptoms may report unprompted
      if (member.symptoms.length > 0 && Math.random() < 0.01) {
        this.generateSymptomReportFrom(member);
        this.lastReportTime = this.missionTime;
        return;
      }

      // Stressed crew may ask confused questions
      if (member.stress > 0.6 && Math.random() < 0.005) {
        const report: CrewReport = {
          id: `rpt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          crewId: member.id,
          crewName: member.name,
          message: this.getConfusionMessage(member),
          reliable: false,
          timestamp: this.missionTime,
          type: 'confusion',
        };
        this.reports.push(report);
        this.eventBus.emit('crew:report', { crewId: member.id, message: report.message, reliable: false });
        this.lastReportTime = this.missionTime;
        return;
      }
    }
  }

  private generateSymptomReport(): void {
    const members = this.crewSim.getMembers();
    const symptomatic = members.filter(m => m.symptoms.length > 0);
    if (symptomatic.length === 0) return;

    const reporter = symptomatic[Math.floor(Math.random() * symptomatic.length)];
    this.generateSymptomReportFrom(reporter);
  }

  private generateSymptomReportFrom(member: CrewMember): void {
    const symptomText = member.symptoms.length > 0
      ? member.symptoms.join(', ')
      : 'not feeling right';

    const messages = [
      `Houston, ${member.role} here. Crew is reporting ${symptomText}.`,
      `${member.name} reporting: we're experiencing ${symptomText} up here.`,
      `Ground, be advised — crew noting ${symptomText}.`,
    ];

    const report: CrewReport = {
      id: `rpt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      crewId: member.id,
      crewName: member.name,
      message: messages[Math.floor(Math.random() * messages.length)],
      reliable: member.cognitivePerformance > 0.4,
      timestamp: this.missionTime,
      type: 'symptom',
    };

    this.reports.push(report);
    this.eventBus.emit('crew:report', { crewId: member.id, message: report.message, reliable: report.reliable });
  }

  private generateObservation(member: CrewMember, reliable: boolean): string {
    if (!reliable) {
      const confused = [
        "Uh... I'm not sure what I'm looking at here. Can you repeat the question?",
        "Copy, Houston. Things look... I think they look okay? Hard to tell.",
        "Ground, I'm having trouble focusing. Give me a moment.",
      ];
      return confused[Math.floor(Math.random() * confused.length)];
    }

    const clear = [
      "Houston, everything looks nominal from up here. Cabin looks good.",
      "Copy, ground. Visual inspection shows no anomalies from this vantage point.",
      `${member.role} reports: all indicators in the cabin check out.`,
      "Roger, Houston. Crew is in good shape. Standing by for tasking.",
    ];
    return clear[Math.floor(Math.random() * clear.length)];
  }

  private getConfusionMessage(member: CrewMember): string {
    const messages = [
      `Houston, ${member.role} here. Are we still on the nominal timeline? I'm losing track.`,
      `Ground, can you confirm current procedure? I want to make sure we're on the right step.`,
      `Houston... what's our priority right now? There's a lot going on up here.`,
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  }
}
