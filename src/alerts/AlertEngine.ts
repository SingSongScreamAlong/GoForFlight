/**
 * Alert Engine — generates, escalates, deduplicates, and manages alerts.
 *
 * Alerts are the player's primary information channel.
 * This engine bridges simulation state → player awareness.
 */

import { EventBus } from '../core/EventBus.js';
import { EntityId, MissionTime, Severity, Subsystem, Status } from '../types/common.js';

export interface Alert {
  id: EntityId;
  subsystem: Subsystem;
  severity: Severity;
  message: string;
  detail?: string;
  createdAt: MissionTime;
  updatedAt: MissionTime;
  acknowledged: boolean;
  resolved: boolean;
  linkedAlerts: EntityId[];
  parameter?: string;
  value?: number;
  threshold?: number;
  escalationCount: number;
  timeSensitive: boolean;
}

export interface AlertThreshold {
  subsystem: Subsystem;
  parameter: string;
  cautionAbove?: number;
  cautionBelow?: number;
  warningAbove?: number;
  warningBelow?: number;
  criticalAbove?: number;
  criticalBelow?: number;
  message: string;
  timeSensitive?: boolean;
}

export class AlertEngine {
  private eventBus: EventBus;
  private alerts = new Map<EntityId, Alert>();
  private thresholds: AlertThreshold[] = [];
  private lastCheckValues = new Map<string, Severity | null>();
  private missionTime: MissionTime = 0;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;

    // Listen for subsystem value changes to check thresholds
    this.eventBus.on('subsystem:valueChanged', (p) => {
      this.checkThresholds(p.subsystem, p.parameter, p.value);
    });

    // Listen for subsystem status changes
    this.eventBus.on('subsystem:statusChanged', (p) => {
      if (p.to === Status.Warning || p.to === Status.Critical || p.to === Status.Failed) {
        this.createAlert({
          subsystem: p.subsystem,
          severity: p.to === Status.Failed ? Severity.Critical : p.to === Status.Critical ? Severity.Critical : Severity.Warning,
          message: `${p.subsystem} status: ${p.to}`,
          detail: p.reason,
          timeSensitive: p.to === Status.Critical || p.to === Status.Failed,
        });
      }
    });

    // Track mission time
    this.eventBus.on('time:tick', (p) => {
      this.missionTime = p.missionTime;
    });

    // Listen for anomaly events
    this.eventBus.on('anomaly:detected', (p) => {
      this.createAlert({
        subsystem: p.subsystem,
        severity: Severity.Caution,
        message: `Anomaly detected in ${p.subsystem}`,
        timeSensitive: false,
      });
    });

    this.eventBus.on('anomaly:escalated', (p) => {
      // Find and escalate related alerts
      for (const alert of this.alerts.values()) {
        if (!alert.resolved && alert.message.includes('Anomaly')) {
          this.escalateAlert(alert.id);
        }
      }
    });
  }

  /** Register alert thresholds for monitoring. */
  registerThresholds(thresholds: AlertThreshold[]): void {
    this.thresholds.push(...thresholds);
  }

  /** Create a new alert. Deduplicates by subsystem + message. */
  createAlert(params: {
    subsystem: Subsystem;
    severity: Severity;
    message: string;
    detail?: string;
    parameter?: string;
    value?: number;
    threshold?: number;
    timeSensitive?: boolean;
  }): Alert {
    // Dedup check: same subsystem + message within recent time
    const existing = this.findDuplicate(params.subsystem, params.message);
    if (existing) {
      // Update existing alert instead of creating new
      if (severityRank(params.severity) > severityRank(existing.severity)) {
        existing.severity = params.severity;
        existing.escalationCount++;
      }
      existing.updatedAt = this.missionTime;
      existing.value = params.value;
      return existing;
    }

    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      subsystem: params.subsystem,
      severity: params.severity,
      message: params.message,
      detail: params.detail,
      createdAt: this.missionTime,
      updatedAt: this.missionTime,
      acknowledged: false,
      resolved: false,
      linkedAlerts: [],
      parameter: params.parameter,
      value: params.value,
      threshold: params.threshold,
      escalationCount: 0,
      timeSensitive: params.timeSensitive ?? false,
    };

    this.alerts.set(alert.id, alert);
    this.eventBus.emit('alert:created', {
      alertId: alert.id,
      subsystem: alert.subsystem,
      severity: alert.severity,
      message: alert.message,
      missionTime: this.missionTime,
    });

    return alert;
  }

  /** Acknowledge an alert (player has seen it). */
  acknowledge(alertId: EntityId): void {
    const alert = this.alerts.get(alertId);
    if (alert && !alert.acknowledged) {
      alert.acknowledged = true;
      this.eventBus.emit('alert:acknowledged', { alertId });
    }
  }

  /** Resolve an alert (condition cleared). */
  resolve(alertId: EntityId): void {
    const alert = this.alerts.get(alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      this.eventBus.emit('alert:resolved', { alertId });
    }
  }

  /** Escalate an alert to higher severity. */
  escalateAlert(alertId: EntityId): void {
    const alert = this.alerts.get(alertId);
    if (!alert || alert.resolved) return;

    const from = alert.severity;
    const next = nextSeverity(from);
    if (next && next !== from) {
      alert.severity = next;
      alert.escalationCount++;
      alert.updatedAt = this.missionTime;
      this.eventBus.emit('alert:escalated', { alertId, from, to: next });
    }
  }

  /** Link two related alerts together. */
  linkAlerts(alertId1: EntityId, alertId2: EntityId): void {
    const a1 = this.alerts.get(alertId1);
    const a2 = this.alerts.get(alertId2);
    if (a1 && a2) {
      if (!a1.linkedAlerts.includes(alertId2)) a1.linkedAlerts.push(alertId2);
      if (!a2.linkedAlerts.includes(alertId1)) a2.linkedAlerts.push(alertId1);
    }
  }

  /** Get all active (unresolved) alerts, sorted by severity then time. */
  getActive(): Alert[] {
    return Array.from(this.alerts.values())
      .filter(a => !a.resolved)
      .sort((a, b) => {
        const sevDiff = severityRank(b.severity) - severityRank(a.severity);
        if (sevDiff !== 0) return sevDiff;
        return b.createdAt - a.createdAt;
      });
  }

  /** Get alerts filtered by subsystem. */
  getBySubsystem(subsystem: Subsystem): Alert[] {
    return this.getActive().filter(a => a.subsystem === subsystem);
  }

  /** Get unacknowledged alerts. */
  getUnacknowledged(): Alert[] {
    return this.getActive().filter(a => !a.acknowledged);
  }

  /** Get all alerts including resolved (for debrief/logging). */
  getAll(): Alert[] {
    return Array.from(this.alerts.values());
  }

  /** Clear all alerts (for mission reset). */
  clear(): void {
    this.alerts.clear();
    this.lastCheckValues.clear();
  }

  private checkThresholds(subsystem: Subsystem, parameter: string, value: number): void {
    for (const threshold of this.thresholds) {
      if (threshold.subsystem !== subsystem || threshold.parameter !== parameter) continue;

      const key = `${subsystem}_${parameter}`;
      let severity: Severity | null = null;

      if ((threshold.criticalAbove !== undefined && value > threshold.criticalAbove) ||
          (threshold.criticalBelow !== undefined && value < threshold.criticalBelow)) {
        severity = Severity.Critical;
      } else if ((threshold.warningAbove !== undefined && value > threshold.warningAbove) ||
                 (threshold.warningBelow !== undefined && value < threshold.warningBelow)) {
        severity = Severity.Warning;
      } else if ((threshold.cautionAbove !== undefined && value > threshold.cautionAbove) ||
                 (threshold.cautionBelow !== undefined && value < threshold.cautionBelow)) {
        severity = Severity.Caution;
      }

      const lastSeverity = this.lastCheckValues.get(key) ?? null;

      if (severity && severity !== lastSeverity) {
        this.createAlert({
          subsystem,
          severity,
          message: threshold.message,
          parameter,
          value,
          threshold: threshold.criticalAbove ?? threshold.warningAbove ?? threshold.cautionAbove,
          timeSensitive: threshold.timeSensitive,
        });
      } else if (!severity && lastSeverity) {
        // Condition cleared — resolve related alerts
        for (const alert of this.alerts.values()) {
          if (!alert.resolved && alert.subsystem === subsystem && alert.parameter === parameter) {
            this.resolve(alert.id);
          }
        }
      }

      this.lastCheckValues.set(key, severity);
    }
  }

  private findDuplicate(subsystem: Subsystem, message: string): Alert | undefined {
    for (const alert of this.alerts.values()) {
      if (!alert.resolved && alert.subsystem === subsystem && alert.message === message) {
        return alert;
      }
    }
    return undefined;
  }
}

function severityRank(s: Severity): number {
  switch (s) {
    case Severity.Info: return 0;
    case Severity.Caution: return 1;
    case Severity.Warning: return 2;
    case Severity.Critical: return 3;
  }
}

function nextSeverity(s: Severity): Severity {
  switch (s) {
    case Severity.Info: return Severity.Caution;
    case Severity.Caution: return Severity.Warning;
    case Severity.Warning: return Severity.Critical;
    case Severity.Critical: return Severity.Critical;
  }
}
