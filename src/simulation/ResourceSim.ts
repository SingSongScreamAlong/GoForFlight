/**
 * Mission resource tracking simulation.
 *
 * Aggregates margins from all subsystems into a unified resource picture.
 * This doesn't simulate physics — it reads from other subsystems.
 */

import { Subsystem, Status, MissionTime } from '../types/common.js';
import { BaseSubsystem } from './BaseSubsystem.js';

export class ResourceSim extends BaseSubsystem {
  readonly subsystem = Subsystem.Crew; // Note: Resources uses a virtual subsystem identity
  // We'll override this — resources is a cross-cutting concern

  // External feeds: set by SimulationManager cross-system dependencies
  private externalFeeds = new Map<string, number>();

  constructor() {
    super();
    this.init(
      {
        propellantMargin: 1.0,
        batteryReserve: 1.0,
        oxygenReserve: 1.0,
        waterReserve: 1.0,
        thermalMargin: 1.0,
        scheduleMarginSec: 3600,
        maneuverWindowMarginSec: 1800,
        publicConfidence: 0.8,
        overallMargin: 1.0,
      },
      {
        propellantMargin: { min: 0, max: 1, nominalMin: 0.2, nominalMax: 1.0, cautionMin: 0.1, warningMin: 0.05 },
        batteryReserve: { min: 0, max: 1, nominalMin: 0.3, nominalMax: 1.0, cautionMin: 0.15, warningMin: 0.05 },
        oxygenReserve: { min: 0, max: 1, nominalMin: 0.25, nominalMax: 1.0, cautionMin: 0.1, warningMin: 0.05 },
        waterReserve: { min: 0, max: 1, nominalMin: 0.2, nominalMax: 1.0, cautionMin: 0.1, warningMin: 0.05 },
        overallMargin: { min: 0, max: 1, nominalMin: 0.3, nominalMax: 1.0, cautionMin: 0.15, warningMin: 0.05 },
      },
    );
  }

  /** Called by SimulationManager to feed in cross-system data. */
  setExternalFeed(key: string, value: number): void {
    this.externalFeeds.set(key, value);
  }

  tick(dt: number, missionTime: MissionTime): void {
    // Pull from external feeds
    for (const [key, value] of this.externalFeeds) {
      this.parameters.set(key, value);
    }

    // Compute overall margin as the minimum of all resource margins
    const margins = [
      this.parameters.get('propellantMargin')!,
      this.parameters.get('batteryReserve')!,
      this.parameters.get('oxygenReserve')!,
      this.parameters.get('waterReserve')!,
      this.parameters.get('thermalMargin')!,
    ];
    this.parameters.set('overallMargin', Math.min(...margins));

    // Schedule margin counts down
    const schedMargin = this.parameters.get('scheduleMarginSec')!;
    this.parameters.set('scheduleMarginSec', Math.max(0, schedMargin - dt));

    // Maneuver window counts down
    const maneuverMargin = this.parameters.get('maneuverWindowMarginSec')!;
    this.parameters.set('maneuverWindowMarginSec', Math.max(0, maneuverMargin - dt));

    this.recordHistory('overallMargin', missionTime);
    this.recordHistory('propellantMargin', missionTime);
    this.recordHistory('batteryReserve', missionTime);

    this.deriveStatus();
  }
}
