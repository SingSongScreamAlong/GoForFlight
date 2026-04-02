/**
 * Debrief System — post-mission review.
 *
 * Assembles: mission timeline, anomaly timeline, decision review,
 * resource spend, rules violated, trust changes, ending summary.
 */

import { EventBus } from '../core/EventBus.js';
import { MissionRuntime } from '../core/MissionRuntime.js';
import { SimulationManager } from '../core/SimulationManager.js';
import { AlertEngine } from '../alerts/AlertEngine.js';
import { ControllerFramework } from '../controllers/ControllerFramework.js';
import { FlightRulesEngine } from '../commands/FlightRulesEngine.js';
import { EntityId, MissionPhase, Severity, Subsystem } from '../types/common.js';

export interface DebriefReport {
  missionId: EntityId;
  missionName: string;
  success: boolean;
  endPhase: MissionPhase;
  duration: number;            // seconds
  timeline: TimelineEntry[];
  decisions: DecisionSummary[];
  anomalies: AnomalySummary[];
  alertsTotal: number;
  alertsCritical: number;
  rulesViolated: string[];
  rulesOverridden: string[];
  trustChanges: Array<{ callsign: string; from: number; to: number }>;
  resourcesRemaining: Record<string, number>;
  objectiveResults: Array<{ name: string; status: string; type: string }>;
  grade: DebriefGrade;
  summary: string;
}

export interface TimelineEntry {
  time: number;
  event: string;
  type: 'phase' | 'alert' | 'command' | 'anomaly' | 'decision' | 'procedure';
}

export interface DecisionSummary {
  description: string;
  choice: string;
  time: number;
  consequencesTriggered: string[];
}

export interface AnomalySummary {
  name: string;
  detected: boolean;
  resolved: boolean;
  escalationLevel: number;
  cascades: number;
}

export type DebriefGrade = 'S' | 'A' | 'B' | 'C' | 'D' | 'F';

export class DebriefSystem {
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  /** Generate a debrief report from current game state. */
  generate(
    mission: MissionRuntime,
    simulation: SimulationManager,
    alerts: AlertEngine,
    controllers: ControllerFramework,
    flightRules: FlightRulesEngine,
  ): DebriefReport {
    const def = mission.getDefinition()!;
    const state = mission.getState()!;
    const allAlerts = alerts.getAll();

    // Build timeline from event history
    const eventHistory = this.eventBus.getHistory(undefined, 500);
    const timeline: TimelineEntry[] = eventHistory
      .filter(h =>
        h.event.startsWith('phase:') ||
        h.event.startsWith('alert:created') ||
        h.event.startsWith('command:') ||
        h.event.startsWith('anomaly:') ||
        h.event.startsWith('decision:') ||
        h.event.startsWith('procedure:')
      )
      .map(h => ({
        time: (h.payload as any)?.missionTime ?? 0,
        event: h.event,
        type: h.event.split(':')[0] as TimelineEntry['type'],
      }));

    // Decision summaries
    const decisions: DecisionSummary[] = state.decisionLog.map(d => ({
      description: d.description,
      choice: d.choice,
      time: d.missionTime,
      consequencesTriggered: d.consequencesTriggered,
    }));

    // Anomaly summaries
    const anomalies: AnomalySummary[] = [
      ...state.activeAnomalies.map(id => ({
        name: id,
        detected: true,
        resolved: false,
        escalationLevel: 0,
        cascades: 0,
      })),
      ...state.resolvedAnomalies.map(id => ({
        name: id,
        detected: true,
        resolved: true,
        escalationLevel: 0,
        cascades: 0,
      })),
    ];

    // Trust changes
    const trustChanges = controllers.getAll().map(c => ({
      callsign: c.callsign,
      from: def.controllerRoster.find(r => r.id === c.id)?.baseTrust ?? 0.5,
      to: c.trustInPlayer,
    }));

    // Flight rule violations
    const violations = flightRules.getViolations();
    const rulesViolated = violations.map(v => v.rule.description);
    const rulesOverridden = violations.filter(v => v.violation.overridden).map(v => v.rule.description);

    // Resource state
    const resourcesRemaining: Record<string, number> = {};
    const propSim = simulation.getSubsystem(Subsystem.Propulsion);
    const eclssSim = simulation.getSubsystem(Subsystem.ECLSS);
    const powerSim = simulation.getSubsystem(Subsystem.Power);
    resourcesRemaining['Propellant'] = propSim?.getParameter('fuelRemaining') ?? 0;
    resourcesRemaining['Oxygen'] = (eclssSim?.getParameter('o2ReserveKg') ?? 0) / 100;
    resourcesRemaining['Water'] = (eclssSim?.getParameter('waterReserveKg') ?? 0) / 50;
    resourcesRemaining['Power'] = powerSim?.getParameter('avgBatteryCharge') ?? 0;

    // Objectives
    const objectiveResults = def.objectives.map(obj => ({
      name: obj.name,
      status: state.objectives.get(obj.id) ?? 'inactive',
      type: obj.type,
    }));

    // Success evaluation
    const primaryComplete = def.objectives
      .filter(o => o.type === 'primary')
      .every(o => state.objectives.get(o.id) === 'completed');

    const success = state.currentPhase !== MissionPhase.Aborted && primaryComplete;

    // Grading
    const grade = this.computeGrade(success, decisions, allAlerts.length, rulesViolated.length, trustChanges, anomalies);

    // Generate summary text
    const summary = this.generateSummary(success, grade, def.name, objectiveResults, anomalies);

    return {
      missionId: def.id,
      missionName: def.name,
      success,
      endPhase: state.currentPhase,
      duration: state.missionTimeElapsed,
      timeline,
      decisions,
      anomalies,
      alertsTotal: allAlerts.length,
      alertsCritical: allAlerts.filter(a => a.severity === Severity.Critical).length,
      rulesViolated,
      rulesOverridden,
      trustChanges,
      resourcesRemaining,
      objectiveResults,
      grade,
      summary,
    };
  }

  private computeGrade(
    success: boolean,
    decisions: DecisionSummary[],
    alertCount: number,
    violationCount: number,
    trustChanges: Array<{ from: number; to: number }>,
    anomalies: AnomalySummary[],
  ): DebriefGrade {
    if (!success) return 'F';

    let score = 100;

    // Deductions
    score -= violationCount * 10;
    score -= alertCount * 1;

    // Trust changes
    const avgTrustDelta = trustChanges.reduce((s, t) => s + (t.to - t.from), 0) / Math.max(1, trustChanges.length);
    if (avgTrustDelta < -0.1) score -= 15;
    else if (avgTrustDelta > 0.1) score += 10;

    // Unresolved anomalies
    const unresolved = anomalies.filter(a => !a.resolved).length;
    score -= unresolved * 15;

    if (score >= 95) return 'S';
    if (score >= 85) return 'A';
    if (score >= 70) return 'B';
    if (score >= 55) return 'C';
    return 'D';
  }

  private generateSummary(
    success: boolean,
    grade: DebriefGrade,
    missionName: string,
    objectives: Array<{ name: string; status: string; type: string }>,
    anomalies: AnomalySummary[],
  ): string {
    if (!success) {
      return `Mission ${missionName} ended in failure. Primary objectives were not completed. Review the timeline to understand what went wrong.`;
    }

    const completed = objectives.filter(o => o.status === 'completed').length;
    const total = objectives.length;
    const anomalyCount = anomalies.length;

    if (grade === 'S') {
      return `Outstanding performance on ${missionName}. All objectives achieved with minimal issues. ${anomalyCount} anomalies handled flawlessly.`;
    }
    if (grade === 'A') {
      return `Strong performance on ${missionName}. ${completed}/${total} objectives completed. Room for improvement in a few areas.`;
    }
    return `${missionName} completed. ${completed}/${total} objectives achieved. ${anomalyCount} anomalies encountered. See detailed review below.`;
  }
}
