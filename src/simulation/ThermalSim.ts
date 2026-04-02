/**
 * Thermal subsystem simulation.
 *
 * Models: thermal zones, heat generation/transfer, radiators,
 * sun/eclipse exposure, hotspot formation, thermal failure escalation.
 */

import { Subsystem, MissionTime } from '../types/common.js';
import { BaseSubsystem } from './BaseSubsystem.js';

interface ThermalZone {
  id: string;
  name: string;
  tempC: number;
  heatGenWatts: number;
  heatTransferCoeff: number; // W/K toward radiator
  nominalMin: number;
  nominalMax: number;
  warningMin: number;
  warningMax: number;
}

export class ThermalSim extends BaseSubsystem {
  readonly subsystem = Subsystem.Thermal;

  private zones: ThermalZone[] = [];
  private inSunlight = true;
  private eclipseFraction = 0;
  private radiatorDeployed = true;

  constructor() {
    super();
    this.init(
      {
        radiatorEfficiency: 0.95,
        solarHeatInput: 200,
        avgTemp: 22,
        inSunlight: 1,
      },
      {
        avgTemp: { min: -40, max: 80, nominalMin: 18, nominalMax: 28, cautionMin: 10, cautionMax: 35, warningMin: 0, warningMax: 45 },
        radiatorEfficiency: { min: 0, max: 1, nominalMin: 0.7, nominalMax: 1.0, cautionMin: 0.5, warningMin: 0.3 },
      },
    );

    this.zones = [
      { id: 'cabin', name: 'Crew Cabin', tempC: 22, heatGenWatts: 400, heatTransferCoeff: 50, nominalMin: 18, nominalMax: 27, warningMin: 10, warningMax: 38 },
      { id: 'avionics', name: 'Avionics Bay', tempC: 35, heatGenWatts: 600, heatTransferCoeff: 80, nominalMin: 20, nominalMax: 45, warningMin: 10, warningMax: 60 },
      { id: 'propulsion', name: 'Propulsion Bay', tempC: 25, heatGenWatts: 100, heatTransferCoeff: 30, nominalMin: -10, nominalMax: 50, warningMin: -30, warningMax: 70 },
      { id: 'exterior', name: 'Exterior Shell', tempC: 15, heatGenWatts: 0, heatTransferCoeff: 200, nominalMin: -80, nominalMax: 80, warningMin: -120, warningMax: 120 },
    ];
  }

  setSunExposure(inSun: boolean, eclipseFrac: number): void {
    this.inSunlight = inSun;
    this.eclipseFraction = eclipseFrac;
    this.parameters.set('inSunlight', inSun ? 1 : 0);
  }

  setRadiatorDeployed(deployed: boolean): void {
    this.radiatorDeployed = deployed;
  }

  getZones(): ThermalZone[] { return this.zones.map(z => ({ ...z })); }

  tick(dt: number, missionTime: MissionTime): void {
    this.applyFaults(dt);

    const radiatorEff = this.parameters.get('radiatorEfficiency')!;
    const solarInput = this.inSunlight ? this.parameters.get('solarHeatInput')! * (1 - this.eclipseFraction) : 0;

    // Radiator rejection capacity
    const radiatorRejection = this.radiatorDeployed ? radiatorEff * 1200 : 100; // watts

    for (const zone of this.zones) {
      // Heat inputs
      const heatIn = zone.heatGenWatts + (zone.id === 'exterior' ? solarInput : solarInput * 0.1);

      // Heat rejection via radiator path
      const heatOut = zone.heatTransferCoeff * (zone.tempC - (-270)) * (radiatorRejection / 1200) * 0.001;

      // Net heat change
      const thermalMass = 500; // J/K (simplified)
      const dTemp = (heatIn - heatOut) / thermalMass * dt;
      zone.tempC += dTemp;

      // Cross-zone conduction (simplified — all zones drift toward average)
      const avgTemp = this.zones.reduce((s, z) => s + z.tempC, 0) / this.zones.length;
      zone.tempC += (avgTemp - zone.tempC) * 0.01 * dt;
    }

    // Update aggregate parameters
    const cabinZone = this.zones.find(z => z.id === 'cabin')!;
    const avionicsZone = this.zones.find(z => z.id === 'avionics')!;
    const avg = this.zones.reduce((s, z) => s + z.tempC, 0) / this.zones.length;
    this.parameters.set('avgTemp', avg);
    this.parameters.set('cabinTemp', cabinZone.tempC);
    this.parameters.set('avionicsTemp', avionicsZone.tempC);

    this.recordHistory('avgTemp', missionTime);
    this.recordHistory('cabinTemp', missionTime);
    this.recordHistory('avionicsTemp', missionTime);
    this.recordHistory('radiatorEfficiency', missionTime);

    this.deriveStatus();
  }
}
