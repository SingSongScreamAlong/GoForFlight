/**
 * Communications subsystem simulation.
 *
 * Models: signal lock, bandwidth, packet loss, delay, antenna modes,
 * handoff logic, blackout periods, degraded telemetry.
 */

import { Subsystem, Status, MissionTime } from '../types/common.js';
import { BaseSubsystem } from './BaseSubsystem.js';

export type AntennaMode = 'primary' | 'backup' | 'omnidirectional';

export class CommsSim extends BaseSubsystem {
  readonly subsystem = Subsystem.Communications;

  private antennaMode: AntennaMode = 'primary';
  private blackoutSchedule: Array<{ start: number; end: number }> = [];
  private handoffInProgress = false;
  private handoffTimer = 0;

  constructor() {
    super();
    this.init(
      {
        signalStrength: 0.95,
        bandwidthKbps: 2048,
        packetLossPercent: 0.5,
        delaySeconds: 1.3,
        signalLocked: 1,
        inBlackout: 0,
        degradedTelemetry: 0,
        antennaHealth: 1.0,
      },
      {
        signalStrength: { min: 0, max: 1, nominalMin: 0.6, nominalMax: 1.0, cautionMin: 0.4, warningMin: 0.2 },
        packetLossPercent: { min: 0, max: 100, nominalMin: 0, nominalMax: 3, cautionMax: 10, warningMax: 25 },
        bandwidthKbps: { min: 0, max: 10000, nominalMin: 512, nominalMax: 10000, cautionMin: 256, warningMin: 64 },
        antennaHealth: { min: 0, max: 1, nominalMin: 0.8, nominalMax: 1.0, cautionMin: 0.5, warningMin: 0.3 },
      },
    );
  }

  /** Set scheduled blackout windows (reentry, occultation). */
  setBlackoutSchedule(schedule: Array<{ start: number; end: number }>): void {
    this.blackoutSchedule = schedule;
  }

  /** Switch antenna mode. Handoff takes time. */
  switchAntenna(mode: AntennaMode): void {
    if (mode === this.antennaMode) return;
    this.handoffInProgress = true;
    this.handoffTimer = 5; // 5 seconds handoff
    this.antennaMode = mode;
  }

  getAntennaMode(): AntennaMode { return this.antennaMode; }

  tick(dt: number, missionTime: MissionTime): void {
    this.applyFaults(dt);

    // Check blackout windows
    const inBlackout = this.blackoutSchedule.some(w => missionTime >= w.start && missionTime <= w.end);
    this.parameters.set('inBlackout', inBlackout ? 1 : 0);

    // Handoff logic
    if (this.handoffInProgress) {
      this.handoffTimer -= dt;
      if (this.handoffTimer <= 0) {
        this.handoffInProgress = false;
      }
    }

    // Signal strength based on antenna mode and health
    const antennaHealth = this.parameters.get('antennaHealth')!;
    let baseSignal: number;
    switch (this.antennaMode) {
      case 'primary': baseSignal = 0.95; break;
      case 'backup': baseSignal = 0.8; break;
      case 'omnidirectional': baseSignal = 0.5; break;
    }

    if (inBlackout) {
      this.parameters.set('signalStrength', 0);
      this.parameters.set('signalLocked', 0);
      this.parameters.set('bandwidthKbps', 0);
      this.parameters.set('packetLossPercent', 100);
    } else if (this.handoffInProgress) {
      this.parameters.set('signalStrength', baseSignal * 0.3 * antennaHealth);
      this.parameters.set('signalLocked', 0);
      this.parameters.set('packetLossPercent', 30);
    } else {
      const signal = baseSignal * antennaHealth;
      this.parameters.set('signalStrength', signal);
      this.parameters.set('signalLocked', signal > 0.2 ? 1 : 0);

      // Bandwidth degrades with signal
      this.parameters.set('bandwidthKbps', 2048 * Math.min(1, signal / 0.6));

      // Packet loss increases as signal drops
      const packetLoss = signal > 0.7 ? 0.5 : signal > 0.4 ? 5 : signal > 0.2 ? 15 : 40;
      this.parameters.set('packetLossPercent', packetLoss);
    }

    // Degraded telemetry
    const signalStrength = this.parameters.get('signalStrength')!;
    this.parameters.set('degradedTelemetry', signalStrength < 0.4 ? 1 : 0);

    // Distance-based delay (simplified — increases over mission time for deep space)
    // For LEO missions, stays roughly constant
    const baseDelay = this.parameters.get('delaySeconds')!;
    this.parameters.set('delaySeconds', Math.max(0.01, baseDelay));

    this.recordHistory('signalStrength', missionTime);
    this.recordHistory('bandwidthKbps', missionTime);
    this.recordHistory('packetLossPercent', missionTime);

    this.deriveStatus();

    if (inBlackout) {
      this.status = Status.Warning; // expected but notable
    }
  }
}
