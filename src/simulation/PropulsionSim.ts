/**
 * Propulsion subsystem simulation.
 *
 * Models: main engine, RCS thrusters, propellant tanks, feed lines,
 * valves, ignition, burn execution, leaks.
 */

import { Subsystem, Status, MissionTime } from '../types/common.js';
import { BaseSubsystem } from './BaseSubsystem.js';

export class PropulsionSim extends BaseSubsystem {
  readonly subsystem = Subsystem.Propulsion;

  private mainEngineActive = false;
  private rcsActive = false;
  private burnStartTime: number | null = null;
  private plannedBurnDuration = 0;

  constructor() {
    super();
    this.init(
      {
        thrustOutput: 0,
        chamberPressure: 0,
        fuelTankPressure: 3200,
        oxTankPressure: 3400,
        fuelLinePressure: 0,
        oxLinePressure: 0,
        fuelRemaining: 1.0,
        oxRemaining: 1.0,
        rcsQuadA: 1.0,
        rcsQuadB: 1.0,
        rcsQuadC: 1.0,
        rcsQuadD: 1.0,
        leakRate: 0,
        mainValve: 1,      // 1=open, 0=closed
        fuelValve: 1,
        oxValve: 1,
      },
      {
        chamberPressure: { min: 0, max: 4500, nominalMin: 2800, nominalMax: 3200, warningMax: 3800 },
        fuelTankPressure: { min: 0, max: 4000, nominalMin: 2900, nominalMax: 3500, cautionMin: 2500, warningMin: 2000 },
        oxTankPressure: { min: 0, max: 4500, nominalMin: 3000, nominalMax: 3600, cautionMin: 2600, warningMin: 2100 },
        fuelRemaining: { min: 0, max: 1, nominalMin: 0.15, nominalMax: 1.0, cautionMin: 0.1, warningMin: 0.05 },
        oxRemaining: { min: 0, max: 1, nominalMin: 0.15, nominalMax: 1.0, cautionMin: 0.1, warningMin: 0.05 },
        leakRate: { min: 0, max: 5, nominalMin: 0, nominalMax: 0, cautionMax: 0.1, warningMax: 0.5 },
      },
    );
  }

  /** Ignite main engine for a planned burn duration. */
  igniteMainEngine(durationSeconds: number): boolean {
    const fuel = this.parameters.get('fuelRemaining')!;
    const ox = this.parameters.get('oxRemaining')!;
    const mainValve = this.parameters.get('mainValve')!;

    if (fuel <= 0 || ox <= 0 || mainValve < 0.5) return false;

    this.mainEngineActive = true;
    this.plannedBurnDuration = durationSeconds;
    this.burnStartTime = null; // will be set on first tick
    return true;
  }

  /** Cut main engine immediately. */
  cutMainEngine(): void {
    this.mainEngineActive = false;
    this.parameters.set('thrustOutput', 0);
    this.parameters.set('chamberPressure', 0);
    this.burnStartTime = null;
  }

  /** Enable/disable RCS. */
  setRCS(active: boolean): void {
    this.rcsActive = active;
  }

  /** Set valve state: 1 = open, 0 = closed. */
  setValve(name: string, open: boolean): void {
    const key = name + 'Valve';
    if (this.parameters.has(key)) {
      this.parameters.set(key, open ? 1 : 0);
    }
  }

  tick(dt: number, missionTime: MissionTime): void {
    this.applyFaults(dt);

    // Main engine burn logic
    if (this.mainEngineActive) {
      if (this.burnStartTime === null) this.burnStartTime = missionTime;

      const fuel = this.parameters.get('fuelRemaining')!;
      const ox = this.parameters.get('oxRemaining')!;
      const fuelValve = this.parameters.get('fuelValve')!;
      const oxValve = this.parameters.get('oxValve')!;

      if (fuel <= 0 || ox <= 0 || fuelValve < 0.5 || oxValve < 0.5) {
        this.cutMainEngine();
      } else {
        // Nominal burn consumption
        const consumptionRate = 0.002 * dt; // fraction per second
        this.parameters.set('fuelRemaining', Math.max(0, fuel - consumptionRate));
        this.parameters.set('oxRemaining', Math.max(0, ox - consumptionRate * 1.2));

        // Engine outputs
        const efficiency = Math.min(fuelValve, oxValve);
        this.parameters.set('thrustOutput', 22000 * efficiency);
        this.parameters.set('chamberPressure', 3000 * efficiency);
        this.parameters.set('fuelLinePressure', this.parameters.get('fuelTankPressure')! * 0.9 * fuelValve);
        this.parameters.set('oxLinePressure', this.parameters.get('oxTankPressure')! * 0.9 * oxValve);

        // Auto-cutoff at planned duration
        if (missionTime - this.burnStartTime! >= this.plannedBurnDuration) {
          this.cutMainEngine();
        }
      }
    } else {
      // Bleed off line pressure when engine is off
      const fuelLine = this.parameters.get('fuelLinePressure')!;
      const oxLine = this.parameters.get('oxLinePressure')!;
      this.parameters.set('fuelLinePressure', fuelLine * Math.max(0, 1 - 0.5 * dt));
      this.parameters.set('oxLinePressure', oxLine * Math.max(0, 1 - 0.5 * dt));
    }

    // Leak modeling
    const leakRate = this.parameters.get('leakRate')!;
    if (leakRate > 0) {
      const fuel = this.parameters.get('fuelRemaining')!;
      this.parameters.set('fuelRemaining', Math.max(0, fuel - leakRate * 0.001 * dt));
      const ftp = this.parameters.get('fuelTankPressure')!;
      this.parameters.set('fuelTankPressure', Math.max(0, ftp - leakRate * 10 * dt));
    }

    // Tank pressure decreases as propellant is consumed
    const fuelFrac = this.parameters.get('fuelRemaining')!;
    const oxFrac = this.parameters.get('oxRemaining')!;
    this.parameters.set('fuelTankPressure', 3200 * Math.max(0.1, fuelFrac));
    this.parameters.set('oxTankPressure', 3400 * Math.max(0.1, oxFrac));

    // RCS propellant draw
    if (this.rcsActive) {
      const rcsConsumption = 0.0001 * dt;
      this.parameters.set('fuelRemaining', Math.max(0, fuelFrac - rcsConsumption));
    }

    // Record history
    this.recordHistory('thrustOutput', missionTime);
    this.recordHistory('chamberPressure', missionTime);
    this.recordHistory('fuelRemaining', missionTime);
    this.recordHistory('oxRemaining', missionTime);
    this.recordHistory('fuelTankPressure', missionTime);
    this.recordHistory('leakRate', missionTime);

    this.deriveStatus();

    // Override to failed if completely out of propellant and engine needed
    if (fuelFrac <= 0 && oxFrac <= 0) {
      this.status = Status.Critical;
    }
  }

  isEngineActive(): boolean { return this.mainEngineActive; }
  isRCSActive(): boolean { return this.rcsActive; }
}
