/**
 * Debug Tools — developer overlay for testing the game.
 *
 * Provides: force anomaly triggers, subsystem state inspection,
 * mission phase skipping, command injection, alert spam test,
 * hidden fault visualization, and a live telemetry overlay.
 */

import { EventBus } from '../core/EventBus.js';
import { TimeController } from '../core/TimeController.js';
import { MissionRuntime } from '../core/MissionRuntime.js';
import { SimulationManager } from '../core/SimulationManager.js';
import { AnomalyDirector } from '../anomaly/AnomalyDirector.js';
import { AlertEngine } from '../alerts/AlertEngine.js';
import { FlightRulesEngine } from '../commands/FlightRulesEngine.js';
import { ControllerFramework } from '../controllers/ControllerFramework.js';
import {
  EntityId,
  MissionPhase,
  Subsystem,
  Severity,
  Status,
} from '../types/common.js';

export interface DebugToolsDependencies {
  eventBus: EventBus;
  time: TimeController;
  mission: MissionRuntime;
  simulation: SimulationManager;
  anomalyDirector: AnomalyDirector;
  alerts: AlertEngine;
  flightRules: FlightRulesEngine;
  controllers: ControllerFramework;
}

export class DebugTools {
  private deps: DebugToolsDependencies;
  private overlayEl: HTMLElement | null = null;
  private visible = false;
  private updateInterval: ReturnType<typeof setInterval> | null = null;

  constructor(deps: DebugToolsDependencies) {
    this.deps = deps;

    // Toggle with backtick key
    if (typeof document !== 'undefined') {
      document.addEventListener('keydown', (e) => {
        if (e.key === '`' || e.key === '~') {
          this.toggle();
        }
      });
    }
  }

  // ── Anomaly control ───────────────────────────────────────────

  /** Force-spawn a specific anomaly. */
  spawnAnomaly(anomalyId: EntityId): void {
    const state = this.deps.anomalyDirector.spawnAnomaly(anomalyId, this.deps.time.getMET());
    if (state) {
      console.log(`[DEBUG] Spawned anomaly: ${anomalyId}`);
    } else {
      console.warn(`[DEBUG] Failed to spawn anomaly: ${anomalyId}`);
    }
  }

  /** Resolve an active anomaly instantly. */
  resolveAnomaly(anomalyId: EntityId): void {
    this.deps.anomalyDirector.resolveAnomaly(anomalyId, this.deps.time.getMET());
    console.log(`[DEBUG] Resolved anomaly: ${anomalyId}`);
  }

  /** List all active anomalies. */
  listAnomalies(): void {
    const active = this.deps.anomalyDirector.getActive();
    if (active.length === 0) {
      console.log('[DEBUG] No active anomalies');
    } else {
      console.table(active.map(a => ({
        id: a.definitionId,
        level: a.currentLevel,
        detected: a.detected,
        resolved: a.resolved,
        symptoms: a.activeSymptoms.length,
        cascades: a.cascadesTriggered.length,
      })));
    }
  }

  // ── Subsystem control ─────────────────────────────────────────

  /** Inspect a subsystem's full state. */
  inspectSubsystem(subsystem: Subsystem): void {
    const sim = this.deps.simulation.getSubsystem(subsystem);
    if (!sim) {
      console.warn(`[DEBUG] Subsystem not found: ${subsystem}`);
      return;
    }
    const state = sim.getState();
    console.group(`[DEBUG] ${subsystem.toUpperCase()}`);
    console.log('Status:', state.status);
    console.log('Parameters:');
    console.table(Object.fromEntries(state.parameters));
    if (state.faults.length > 0) {
      console.log('Faults:');
      console.table(state.faults);
    } else {
      console.log('Faults: none');
    }
    console.groupEnd();
  }

  /** Inspect all subsystems at once. */
  inspectAll(): void {
    const states = this.deps.simulation.getAllStates();
    const summary: Record<string, { status: string; params: number; faults: number }> = {};
    for (const [sub, state] of states) {
      summary[sub] = {
        status: state.status,
        params: state.parameters.size,
        faults: state.faults.length,
      };
    }
    console.table(summary);
  }

  /** Set a parameter on any subsystem. */
  setParam(subsystem: Subsystem, param: string, value: number): void {
    const sim = this.deps.simulation.getSubsystem(subsystem);
    sim?.setParameter(param, value);
    console.log(`[DEBUG] ${subsystem}.${param} = ${value}`);
  }

  /** Inject a fault into a subsystem. */
  injectFault(subsystem: Subsystem, param: string, severity = 0.5, rate = 0.01): void {
    const sim = this.deps.simulation.getSubsystem(subsystem);
    sim?.injectFault({
      id: `debug_${Date.now()}`,
      hidden: false,
      severity,
      affectedParameters: [param],
      escalationRate: rate,
      timeActive: 0,
    });
    console.log(`[DEBUG] Fault injected: ${subsystem}.${param} (sev=${severity})`);
  }

  /** Clear all faults on a subsystem. */
  clearFaults(subsystem: Subsystem): void {
    const sim = this.deps.simulation.getSubsystem(subsystem);
    if (sim) {
      const state = sim.getState();
      for (const fault of state.faults) {
        sim.clearFault(fault.id);
      }
      console.log(`[DEBUG] Cleared ${state.faults.length} faults from ${subsystem}`);
    }
  }

  /** Show all hidden (undetected) faults across all subsystems. */
  showHiddenFaults(): void {
    const states = this.deps.simulation.getAllStates();
    const hidden: Array<{ subsystem: string; faultId: string; severity: number; params: string }> = [];
    for (const [sub, state] of states) {
      for (const fault of state.faults) {
        if (fault.hidden) {
          hidden.push({
            subsystem: sub,
            faultId: fault.id,
            severity: fault.severity,
            params: fault.affectedParameters.join(', '),
          });
        }
      }
    }
    if (hidden.length === 0) {
      console.log('[DEBUG] No hidden faults');
    } else {
      console.table(hidden);
    }
  }

  // ── Mission control ───────────────────────────────────────────

  /** Skip to a specific mission phase. */
  skipToPhase(phase: MissionPhase): void {
    this.deps.mission.setPhase(phase);
    console.log(`[DEBUG] Skipped to phase: ${phase}`);
  }

  /** Complete the current mission successfully. */
  forceComplete(): void {
    this.deps.mission.completeMission();
    console.log('[DEBUG] Mission force-completed');
  }

  /** Force abort the mission. */
  forceAbort(reason = 'Debug abort'): void {
    this.deps.mission.abortMission(reason);
    console.log(`[DEBUG] Mission aborted: ${reason}`);
  }

  // ── Alert control ─────────────────────────────────────────────

  /** Generate a test alert. */
  testAlert(subsystem: Subsystem, severity: Severity, message = 'Debug test alert'): void {
    this.deps.alerts.createAlert({ subsystem, severity, message, timeSensitive: false });
    console.log(`[DEBUG] Alert created: ${severity} on ${subsystem}`);
  }

  /** Spam test alerts (for UI stress testing). */
  alertSpam(count = 20): void {
    const subsystems = Object.values(Subsystem);
    const severities = [Severity.Info, Severity.Caution, Severity.Warning, Severity.Critical];
    for (let i = 0; i < count; i++) {
      const sub = subsystems[i % subsystems.length];
      const sev = severities[i % severities.length];
      this.deps.alerts.createAlert({
        subsystem: sub,
        severity: sev,
        message: `Spam alert #${i + 1}: ${sub} ${sev}`,
        timeSensitive: sev === Severity.Critical,
      });
    }
    console.log(`[DEBUG] Spammed ${count} alerts`);
  }

  /** Clear all alerts. */
  clearAlerts(): void {
    this.deps.alerts.clear();
    console.log('[DEBUG] All alerts cleared');
  }

  // ── Time control ──────────────────────────────────────────────

  /** Jump forward in mission time. */
  timeJump(seconds: number): void {
    const currentMET = this.deps.time.getMET();
    this.deps.time.setMET(currentMET + seconds);
    console.log(`[DEBUG] Jumped ${seconds}s forward. MET: ${this.deps.time.getFormattedMET()}`);
  }

  // ── Controller manipulation ───────────────────────────────────

  /** Set trust level for all controllers. */
  setAllTrust(trust: number): void {
    for (const ctrl of this.deps.controllers.getAll()) {
      ctrl.trustInPlayer = Math.max(0, Math.min(1, trust));
    }
    console.log(`[DEBUG] All controller trust set to ${trust}`);
  }

  // ── Debug overlay ─────────────────────────────────────────────

  /** Toggle the debug overlay panel. */
  toggle(): void {
    this.visible = !this.visible;
    if (this.visible) {
      this.createOverlay();
      this.startUpdating();
    } else {
      this.destroyOverlay();
      this.stopUpdating();
    }
  }

  private createOverlay(): void {
    if (this.overlayEl) return;

    this.overlayEl = document.createElement('div');
    this.overlayEl.id = 'gff-debug-overlay';
    this.overlayEl.style.cssText = `
      position: fixed; top: 0; right: 0; width: 380px; height: 100vh;
      background: rgba(0,0,0,0.92); color: #0f0; font-family: monospace;
      font-size: 10px; padding: 8px; overflow-y: auto; z-index: 10000;
      border-left: 2px solid #333;
    `;
    document.body.appendChild(this.overlayEl);
  }

  private destroyOverlay(): void {
    this.overlayEl?.remove();
    this.overlayEl = null;
  }

  private startUpdating(): void {
    this.updateInterval = setInterval(() => this.updateOverlay(), 500);
  }

  private stopUpdating(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  private updateOverlay(): void {
    if (!this.overlayEl) return;

    const time = this.deps.time;
    const mission = this.deps.mission;
    const states = this.deps.simulation.getAllStates();
    const alerts = this.deps.alerts.getActive();
    const anomalies = this.deps.anomalyDirector.getActive();
    const violations = this.deps.flightRules.getViolations();

    let html = `<div style="color:#ff0;font-size:12px;margin-bottom:8px;">DEBUG OVERLAY [~ to close]</div>`;

    // Time
    html += `<div>MET: ${time.getFormattedMET()} | Scale: ${time.getTimeScale()}x | ${time.isPaused() ? 'PAUSED' : 'RUNNING'}</div>`;
    html += `<div>Phase: ${mission.getCurrentPhase() ?? 'N/A'}</div>`;
    html += `<hr style="border-color:#333;margin:4px 0;">`;

    // Subsystems
    html += `<div style="color:#ff0;">SUBSYSTEMS</div>`;
    for (const [sub, state] of states) {
      const color = state.status === Status.Nominal ? '#0f0' :
                    state.status === Status.Caution ? '#ff0' :
                    state.status === Status.Warning ? '#f80' : '#f00';
      const faultCount = state.faults.length;
      const hiddenFaults = state.faults.filter(f => f.hidden).length;
      html += `<div><span style="color:${color};">■</span> ${sub}: ${state.status}`;
      if (faultCount > 0) html += ` [${faultCount}F${hiddenFaults > 0 ? ` ${hiddenFaults}H` : ''}]`;
      html += `</div>`;
    }

    html += `<hr style="border-color:#333;margin:4px 0;">`;

    // Anomalies
    html += `<div style="color:#ff0;">ANOMALIES (${anomalies.length})</div>`;
    for (const a of anomalies) {
      html += `<div>• ${a.definitionId} L${a.currentLevel} ${a.detected ? 'DET' : 'HID'} ${a.resolved ? 'RES' : ''}</div>`;
    }

    // Alerts
    html += `<div style="color:#ff0;margin-top:4px;">ALERTS (${alerts.length})</div>`;
    for (const a of alerts.slice(0, 5)) {
      html += `<div>• [${a.severity}] ${a.message.substring(0, 40)}</div>`;
    }
    if (alerts.length > 5) html += `<div>... +${alerts.length - 5} more</div>`;

    // Flight rule violations
    if (violations.length > 0) {
      html += `<div style="color:#f00;margin-top:4px;">VIOLATIONS (${violations.length})</div>`;
      for (const v of violations) {
        html += `<div>• ${v.rule.name} ${v.violation.overridden ? '[OVERRIDE]' : ''}</div>`;
      }
    }

    // Controller trust
    html += `<hr style="border-color:#333;margin:4px 0;">`;
    html += `<div style="color:#ff0;">CONTROLLERS</div>`;
    for (const c of this.deps.controllers.getAll()) {
      const trustBar = '█'.repeat(Math.round(c.trustInPlayer * 10)) + '░'.repeat(10 - Math.round(c.trustInPlayer * 10));
      html += `<div>${c.callsign}: ${trustBar} ${(c.trustInPlayer * 100).toFixed(0)}% ${c.currentAssessment}</div>`;
    }

    this.overlayEl.innerHTML = html;
  }
}
