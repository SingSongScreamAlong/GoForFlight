/**
 * Event Logger — records all significant events for debrief and replay.
 *
 * Logs: alerts, commands, controller recommendations, rule violations,
 * anomaly triggers, system state transitions, decisions.
 */

import { EventBus } from '../core/EventBus.js';
import { MissionTime, Severity, Subsystem } from '../types/common.js';

export interface LogEntry {
  id: string;
  timestamp: MissionTime;
  category: 'alert' | 'command' | 'controller' | 'flight_rule' | 'anomaly' | 'system' | 'decision' | 'procedure' | 'phase' | 'crew';
  severity: Severity;
  message: string;
  detail?: string;
  subsystem?: Subsystem;
}

export class EventLogger {
  private eventBus: EventBus;
  private entries: LogEntry[] = [];
  private missionTime: MissionTime = 0;
  private counter = 0;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;

    this.eventBus.on('time:tick', (p) => { this.missionTime = p.missionTime; });

    // Log alerts
    this.eventBus.on('alert:created', (p) => {
      this.log('alert', p.severity as Severity, p.message, undefined, p.subsystem);
    });
    this.eventBus.on('alert:escalated', (p) => {
      this.log('alert', Severity.Warning, `Alert ${p.alertId} escalated: ${p.from} → ${p.to}`);
    });

    // Log commands
    this.eventBus.on('command:issued', (p) => {
      this.log('command', Severity.Info, `Command issued: ${p.type}`, undefined, p.target === 'mission' ? undefined : p.target as Subsystem);
    });
    this.eventBus.on('command:failed', (p) => {
      this.log('command', Severity.Warning, `Command failed: ${p.reason}`);
    });

    // Log controller events
    this.eventBus.on('controller:recommendation', (p) => {
      this.log('controller', p.urgency as Severity, p.message, undefined, p.subsystem);
    });
    this.eventBus.on('controller:dialogue', (p) => {
      this.log('controller', Severity.Info, `${p.controllerId}: ${p.text}`);
    });

    // Log flight rule events
    this.eventBus.on('flightRule:violated', (p) => {
      this.log('flight_rule', Severity.Warning, `Flight rule violated: ${p.description}`, undefined, p.subsystem);
    });

    // Log anomaly events
    this.eventBus.on('anomaly:spawned', (p) => {
      this.log('anomaly', Severity.Caution, `Anomaly spawned: ${p.anomalyId}`, p.hidden ? 'Hidden' : 'Visible');
    });
    this.eventBus.on('anomaly:escalated', (p) => {
      this.log('anomaly', Severity.Warning, `Anomaly escalated: ${p.anomalyId} to level ${p.level}`);
    });
    this.eventBus.on('anomaly:resolved', (p) => {
      this.log('anomaly', Severity.Info, `Anomaly resolved: ${p.anomalyId}`);
    });
    this.eventBus.on('anomaly:cascaded', (p) => {
      this.log('anomaly', Severity.Warning, `Cascade: ${p.sourceId} → ${p.targetSubsystem}`, undefined, p.targetSubsystem);
    });

    // Log subsystem changes
    this.eventBus.on('subsystem:statusChanged', (p) => {
      this.log('system', Severity.Caution, `${p.subsystem}: ${p.from} → ${p.to}`, p.reason, p.subsystem);
    });

    // Log decisions
    this.eventBus.on('decision:made', (p) => {
      this.log('decision', Severity.Info, `Decision: ${p.choice}`);
    });

    // Log procedures
    this.eventBus.on('procedure:started', (p) => {
      this.log('procedure', Severity.Info, `Procedure started: ${p.name}`);
    });
    this.eventBus.on('procedure:completed', (p) => {
      this.log('procedure', Severity.Info, `Procedure ${p.success ? 'completed' : 'failed'}: ${p.procedureId}`);
    });

    // Log phase changes
    this.eventBus.on('phase:changed', (p) => {
      this.log('phase', Severity.Info, `Phase: ${p.from} → ${p.to}`);
    });

    // Log crew events
    this.eventBus.on('crew:report', (p) => {
      this.log('crew', Severity.Info, p.message, p.reliable ? undefined : 'UNRELIABLE');
    });
  }

  /** Get all log entries. */
  getAll(): LogEntry[] {
    return [...this.entries];
  }

  /** Get entries filtered by category. */
  getByCategory(category: LogEntry['category']): LogEntry[] {
    return this.entries.filter(e => e.category === category);
  }

  /** Get entries filtered by subsystem. */
  getBySubsystem(subsystem: Subsystem): LogEntry[] {
    return this.entries.filter(e => e.subsystem === subsystem);
  }

  /** Get entries within a time range. */
  getByTimeRange(startTime: MissionTime, endTime: MissionTime): LogEntry[] {
    return this.entries.filter(e => e.timestamp >= startTime && e.timestamp <= endTime);
  }

  /** Get recent entries. */
  getRecent(limit = 50): LogEntry[] {
    return this.entries.slice(-limit);
  }

  /** Clear the log. */
  clear(): void {
    this.entries = [];
    this.counter = 0;
  }

  /** Export log as JSON string. */
  export(): string {
    return JSON.stringify(this.entries, null, 2);
  }

  private log(
    category: LogEntry['category'],
    severity: Severity,
    message: string,
    detail?: string,
    subsystem?: Subsystem,
  ): void {
    this.entries.push({
      id: `log_${++this.counter}`,
      timestamp: this.missionTime,
      category,
      severity,
      message,
      detail,
      subsystem,
    });
  }
}
