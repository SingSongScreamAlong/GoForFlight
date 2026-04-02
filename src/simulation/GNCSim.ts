/**
 * Guidance, Navigation & Control subsystem simulation.
 *
 * Models: attitude state, orientation control, sensor fusion,
 * IMU drift, star tracker, trajectory deviation, correction windows.
 */

import { Subsystem, Status, MissionTime } from '../types/common.js';
import { BaseSubsystem } from './BaseSubsystem.js';

export class GNCSim extends BaseSubsystem {
  readonly subsystem = Subsystem.GNC;

  private attitudeHoldActive = true;
  private starTrackerActive = true;
  private lastCalibrationTime = 0;

  constructor() {
    super();
    this.init(
      {
        // Attitude rates (deg/s) — should be near zero in stable flight
        rollRate: 0,
        pitchRate: 0,
        yawRate: 0,
        // Sensor state
        sensorConfidence: 0.98,
        imuDriftDegPerHour: 0.01,
        starTrackerActive: 1,
        // Trajectory
        deviationFromPlanKm: 0,
        onTargetTrajectory: 1,
        nextCorrectionWindowSec: 3600,
        // Control
        controlStable: 1,
        controlAuthority: 1.0,  // 0-1: how much control authority remains (RCS fuel, CMG health)
      },
      {
        sensorConfidence: { min: 0, max: 1, nominalMin: 0.9, nominalMax: 1.0, cautionMin: 0.75, warningMin: 0.5 },
        imuDriftDegPerHour: { min: 0, max: 10, nominalMin: 0, nominalMax: 0.05, cautionMax: 0.2, warningMax: 1.0 },
        deviationFromPlanKm: { min: 0, max: 1000, nominalMin: 0, nominalMax: 1, cautionMax: 5, warningMax: 20 },
        rollRate: { min: -10, max: 10, nominalMin: -0.1, nominalMax: 0.1, cautionMin: -0.5, cautionMax: 0.5, warningMin: -2, warningMax: 2 },
        pitchRate: { min: -10, max: 10, nominalMin: -0.1, nominalMax: 0.1, cautionMin: -0.5, cautionMax: 0.5, warningMin: -2, warningMax: 2 },
        yawRate: { min: -10, max: 10, nominalMin: -0.1, nominalMax: 0.1, cautionMin: -0.5, cautionMax: 0.5, warningMin: -2, warningMax: 2 },
        controlAuthority: { min: 0, max: 1, nominalMin: 0.7, nominalMax: 1.0, cautionMin: 0.4, warningMin: 0.2 },
      },
    );
  }

  setAttitudeHold(active: boolean): void {
    this.attitudeHoldActive = active;
  }

  setStarTracker(active: boolean): void {
    this.starTrackerActive = active;
    this.parameters.set('starTrackerActive', active ? 1 : 0);
  }

  /** Recalibrate IMU using star tracker. */
  calibrate(missionTime: MissionTime): void {
    if (this.starTrackerActive) {
      this.parameters.set('imuDriftDegPerHour', 0.01);
      this.parameters.set('sensorConfidence', Math.min(1, this.parameters.get('sensorConfidence')! + 0.1));
      this.lastCalibrationTime = missionTime;
    }
  }

  tick(dt: number, missionTime: MissionTime): void {
    this.applyFaults(dt);

    const controlAuth = this.parameters.get('controlAuthority')!;

    // IMU drift accumulates over time since last calibration
    const timeSinceCalibration = missionTime - this.lastCalibrationTime;
    const baseDrift = this.parameters.get('imuDriftDegPerHour')!;
    const accumulatedDrift = baseDrift * (1 + timeSinceCalibration / 36000); // slow growth
    this.parameters.set('imuDriftDegPerHour', Math.min(10, accumulatedDrift));

    // Sensor confidence degrades with drift
    if (!this.starTrackerActive) {
      const conf = this.parameters.get('sensorConfidence')!;
      this.parameters.set('sensorConfidence', Math.max(0, conf - 0.001 * dt));
    } else {
      // Star tracker helps maintain confidence
      const conf = this.parameters.get('sensorConfidence')!;
      this.parameters.set('sensorConfidence', Math.min(1, conf + 0.005 * dt));
    }

    // Attitude rates
    let roll = this.parameters.get('rollRate')!;
    let pitch = this.parameters.get('pitchRate')!;
    let yaw = this.parameters.get('yawRate')!;

    if (this.attitudeHoldActive && controlAuth > 0.1) {
      // Active control damps rates toward zero
      const dampRate = 0.5 * controlAuth * dt;
      roll += (0 - roll) * dampRate;
      pitch += (0 - pitch) * dampRate;
      yaw += (0 - yaw) * dampRate;
    } else {
      // Without control, rates drift from disturbances
      roll += (Math.random() - 0.5) * 0.01 * dt;
      pitch += (Math.random() - 0.5) * 0.01 * dt;
      yaw += (Math.random() - 0.5) * 0.01 * dt;
    }

    this.parameters.set('rollRate', roll);
    this.parameters.set('pitchRate', pitch);
    this.parameters.set('yawRate', yaw);

    // Control stability
    const maxRate = Math.max(Math.abs(roll), Math.abs(pitch), Math.abs(yaw));
    this.parameters.set('controlStable', maxRate < 1.0 ? 1 : 0);

    // Trajectory deviation grows if rates are unstable
    let deviation = this.parameters.get('deviationFromPlanKm')!;
    if (maxRate > 0.5) {
      deviation += maxRate * 0.01 * dt;
    }
    this.parameters.set('deviationFromPlanKm', Math.max(0, deviation));
    this.parameters.set('onTargetTrajectory', deviation < 1 ? 1 : 0);

    // Correction window countdown
    const corrWindow = this.parameters.get('nextCorrectionWindowSec')!;
    this.parameters.set('nextCorrectionWindowSec', Math.max(0, corrWindow - dt));

    this.recordHistory('sensorConfidence', missionTime);
    this.recordHistory('rollRate', missionTime);
    this.recordHistory('deviationFromPlanKm', missionTime);
    this.recordHistory('controlAuthority', missionTime);

    this.deriveStatus();

    if (maxRate > 5 || this.parameters.get('sensorConfidence')! < 0.2) {
      this.status = Status.Critical;
    }
  }
}
