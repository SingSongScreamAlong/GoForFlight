/**
 * Structural integrity subsystem simulation.
 *
 * Models: hull integrity, vibration stress, thermal stress,
 * impact damage, seal integrity, compartment risk, cascading effects.
 */

import { Subsystem, Status, MissionTime } from '../types/common.js';
import { BaseSubsystem } from './BaseSubsystem.js';

interface Compartment {
  id: string;
  name: string;
  integrity: number;    // 0-1
  pressurized: boolean;
  accessible: boolean;
}

export class StructuresSim extends BaseSubsystem {
  readonly subsystem = Subsystem.Structures;

  private compartments: Compartment[] = [];

  constructor() {
    super();
    this.init(
      {
        hullIntegrity: 1.0,
        vibrationG: 0,
        thermalStress: 0,
        impactDamage: 0,
        sealIntegrity: 1.0,
      },
      {
        hullIntegrity: { min: 0, max: 1, nominalMin: 0.95, nominalMax: 1.0, cautionMin: 0.85, warningMin: 0.7 },
        vibrationG: { min: 0, max: 20, nominalMin: 0, nominalMax: 1.5, cautionMax: 4, warningMax: 8 },
        thermalStress: { min: 0, max: 1, nominalMin: 0, nominalMax: 0.3, cautionMax: 0.5, warningMax: 0.8 },
        sealIntegrity: { min: 0, max: 1, nominalMin: 0.9, nominalMax: 1.0, cautionMin: 0.75, warningMin: 0.5 },
      },
    );

    this.compartments = [
      { id: 'crew_module', name: 'Crew Module', integrity: 1.0, pressurized: true, accessible: true },
      { id: 'service_module', name: 'Service Module', integrity: 1.0, pressurized: false, accessible: false },
      { id: 'cargo_bay', name: 'Cargo Bay', integrity: 1.0, pressurized: true, accessible: true },
    ];
  }

  /** Apply impact damage (e.g., micrometeorite). */
  applyImpact(severity: number, compartmentId?: string): void {
    this.parameters.set('impactDamage', 1);
    const hull = this.parameters.get('hullIntegrity')!;
    this.parameters.set('hullIntegrity', Math.max(0, hull - severity));

    const seal = this.parameters.get('sealIntegrity')!;
    this.parameters.set('sealIntegrity', Math.max(0, seal - severity * 0.5));

    if (compartmentId) {
      const comp = this.compartments.find(c => c.id === compartmentId);
      if (comp) {
        comp.integrity = Math.max(0, comp.integrity - severity);
        if (comp.integrity < 0.3) {
          comp.accessible = false;
        }
      }
    }
  }

  getCompartments(): Compartment[] { return this.compartments.map(c => ({ ...c })); }

  tick(dt: number, missionTime: MissionTime): void {
    this.applyFaults(dt);

    const vibration = this.parameters.get('vibrationG')!;
    const thermalStress = this.parameters.get('thermalStress')!;

    // Vibration causes slow structural fatigue
    if (vibration > 2) {
      const hull = this.parameters.get('hullIntegrity')!;
      this.parameters.set('hullIntegrity', Math.max(0, hull - vibration * 0.0001 * dt));
    }

    // Thermal stress degrades seals
    if (thermalStress > 0.5) {
      const seal = this.parameters.get('sealIntegrity')!;
      this.parameters.set('sealIntegrity', Math.max(0, seal - thermalStress * 0.0001 * dt));
    }

    // Vibration naturally dampens when not under thrust
    if (vibration > 0) {
      this.parameters.set('vibrationG', Math.max(0, vibration - 0.1 * dt));
    }

    // Compartment integrity slowly recovers if not damaged (self-sealing)
    for (const comp of this.compartments) {
      if (comp.integrity < 1.0 && comp.integrity > 0.5) {
        comp.integrity = Math.min(1.0, comp.integrity + 0.0001 * dt);
      }
    }

    // Aggregate compartment health into hull integrity
    const avgCompartment = this.compartments.reduce((s, c) => s + c.integrity, 0) / this.compartments.length;
    const hull = this.parameters.get('hullIntegrity')!;
    this.parameters.set('hullIntegrity', Math.min(hull, avgCompartment));

    this.recordHistory('hullIntegrity', missionTime);
    this.recordHistory('vibrationG', missionTime);
    this.recordHistory('sealIntegrity', missionTime);

    this.deriveStatus();

    if (hull < 0.3 || this.parameters.get('sealIntegrity')! < 0.2) {
      this.status = Status.Failed;
    }
  }
}
