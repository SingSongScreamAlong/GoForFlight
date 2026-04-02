/**
 * Power subsystem simulation.
 *
 * Models: bus voltage, batteries, load balancing, generation,
 * emergency power mode, load shedding.
 */

import { Subsystem, Status, MissionTime } from '../types/common.js';
import { BaseSubsystem } from './BaseSubsystem.js';

interface Battery {
  id: string;
  charge: number;       // 0-1
  health: number;       // 0-1
  charging: boolean;
  discharging: boolean;
  tempC: number;
}

export class PowerSim extends BaseSubsystem {
  readonly subsystem = Subsystem.Power;

  private batteries: Battery[] = [];
  private emergencyMode = false;
  private loadSheddingActive = false;
  private shedPriority: string[] = []; // subsystems to shed in order

  constructor() {
    super();
    this.init(
      {
        busVoltage: 28.5,
        totalLoadWatts: 1200,
        totalGenerationWatts: 1500,
        solarArrayOutput: 1500,
        emergencyPower: 0,     // 0=off, 1=on
        loadShedding: 0,
      },
      {
        busVoltage: { min: 20, max: 35, nominalMin: 27, nominalMax: 30, cautionMin: 25, cautionMax: 31, warningMin: 23, warningMax: 33 },
        totalLoadWatts: { min: 0, max: 5000, nominalMin: 0, nominalMax: 2500, cautionMax: 3500, warningMax: 4500 },
      },
    );

    // Initialize batteries
    this.batteries = [
      { id: 'bat_a', charge: 1.0, health: 1.0, charging: false, discharging: false, tempC: 22 },
      { id: 'bat_b', charge: 1.0, health: 1.0, charging: false, discharging: false, tempC: 22 },
      { id: 'bat_c', charge: 0.95, health: 0.98, charging: false, discharging: false, tempC: 23 },
    ];
  }

  /** Enable emergency power mode (batteries only). */
  setEmergencyMode(active: boolean): void {
    this.emergencyMode = active;
    this.parameters.set('emergencyPower', active ? 1 : 0);
  }

  /** Activate load shedding to reduce power draw. */
  activateLoadShedding(subsystemPriority: string[]): void {
    this.loadSheddingActive = true;
    this.shedPriority = subsystemPriority;
    this.parameters.set('loadShedding', 1);
  }

  deactivateLoadShedding(): void {
    this.loadSheddingActive = false;
    this.shedPriority = [];
    this.parameters.set('loadShedding', 0);
  }

  getBatteries(): Battery[] { return [...this.batteries]; }

  tick(dt: number, missionTime: MissionTime): void {
    this.applyFaults(dt);

    const generation = this.parameters.get('totalGenerationWatts')!;
    let load = this.parameters.get('totalLoadWatts')!;
    const solarOutput = this.parameters.get('solarArrayOutput')!;

    // Load shedding reduces draw
    if (this.loadSheddingActive) {
      load *= 0.6;
      this.parameters.set('totalLoadWatts', load);
    }

    // Power balance
    let availablePower = this.emergencyMode ? 0 : solarOutput;
    const powerDeficit = load - availablePower;

    // Battery management
    for (const bat of this.batteries) {
      if (powerDeficit > 0 && bat.charge > 0) {
        // Discharge batteries to cover deficit
        bat.discharging = true;
        bat.charging = false;
        const discharge = Math.min(powerDeficit, 500) * dt / 3600 / 1000; // kWh consumed
        bat.charge = Math.max(0, bat.charge - discharge * (2 - bat.health));
        availablePower += Math.min(powerDeficit, 500);
        bat.tempC += 0.01 * dt; // heat from discharge
      } else if (powerDeficit < -200 && bat.charge < 1.0) {
        // Charge batteries with excess power
        bat.charging = true;
        bat.discharging = false;
        const chargeRate = Math.min(-powerDeficit, 300) * dt / 3600 / 1000;
        bat.charge = Math.min(1.0, bat.charge + chargeRate * bat.health);
        bat.tempC += 0.005 * dt;
      } else {
        bat.charging = false;
        bat.discharging = false;
        // Cool down toward ambient
        bat.tempC += (22 - bat.tempC) * 0.01 * dt;
      }

      // Battery health degrades slowly at high temps
      if (bat.tempC > 40) {
        bat.health = Math.max(0.1, bat.health - 0.0001 * dt);
      }
    }

    // Bus voltage is a function of power balance
    const avgBatCharge = this.batteries.reduce((s, b) => s + b.charge, 0) / this.batteries.length;
    const baseVoltage = this.emergencyMode ? 26 : 28.5;
    const voltageFromBalance = availablePower >= load ? 0 : -2 * (1 - availablePower / Math.max(load, 1));
    const voltageFromBattery = (avgBatCharge - 0.5) * 2; // ±1V swing from battery state
    this.parameters.set('busVoltage', Math.max(20, Math.min(35, baseVoltage + voltageFromBalance + voltageFromBattery)));

    // Sync battery aggregate parameter
    this.parameters.set('avgBatteryCharge', avgBatCharge);
    this.parameters.set('avgBatteryTemp', this.batteries.reduce((s, b) => s + b.tempC, 0) / this.batteries.length);

    this.recordHistory('busVoltage', missionTime);
    this.recordHistory('totalLoadWatts', missionTime);
    this.recordHistory('avgBatteryCharge', missionTime);

    this.deriveStatus();

    // Hard failure if all batteries dead and no generation
    if (avgBatCharge <= 0 && availablePower <= 0) {
      this.status = Status.Failed;
    }
  }

  reset(): void {
    super.reset();
    this.emergencyMode = false;
    this.loadSheddingActive = false;
  }
}
