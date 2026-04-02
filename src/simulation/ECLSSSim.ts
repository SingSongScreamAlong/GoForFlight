/**
 * ECLSS / Life Support subsystem simulation.
 *
 * Models: O2 levels, CO2 scrubbing, cabin pressure, humidity,
 * trace contaminants, water supply, crew symptom thresholds, leaks.
 */

import { Subsystem, Status, MissionTime } from '../types/common.js';
import { BaseSubsystem } from './BaseSubsystem.js';

export class ECLSSSim extends BaseSubsystem {
  readonly subsystem = Subsystem.ECLSS;

  private crewCount = 3;
  private scrubberActive = true;

  constructor() {
    super();
    this.init(
      {
        oxygenPercent: 20.9,
        co2Ppm: 400,
        cabinPressureKpa: 101.3,
        humidityPercent: 45,
        traceContaminantsPpm: 5,
        waterReserveKg: 50,
        scrubberEfficiency: 0.95,
        leakRateKpaPerHour: 0,
        o2FlowRate: 1.0,          // kg/hr
        o2ReserveKg: 100,
      },
      {
        oxygenPercent: { min: 0, max: 100, nominalMin: 19.5, nominalMax: 23.5, cautionMin: 18.5, cautionMax: 24.5, warningMin: 17, warningMax: 25.5 },
        co2Ppm: { min: 0, max: 50000, nominalMin: 0, nominalMax: 1000, cautionMax: 2500, warningMax: 5000 },
        cabinPressureKpa: { min: 0, max: 120, nominalMin: 98, nominalMax: 104, cautionMin: 90, cautionMax: 108, warningMin: 80, warningMax: 115 },
        humidityPercent: { min: 0, max: 100, nominalMin: 30, nominalMax: 60, cautionMin: 20, cautionMax: 75, warningMax: 90 },
        waterReserveKg: { min: 0, max: 100, nominalMin: 10, nominalMax: 100, cautionMin: 5, warningMin: 2 },
        traceContaminantsPpm: { min: 0, max: 500, nominalMin: 0, nominalMax: 25, cautionMax: 50, warningMax: 100 },
      },
    );
  }

  setCrewCount(count: number): void { this.crewCount = count; }
  setScrubberActive(active: boolean): void { this.scrubberActive = active; }

  tick(dt: number, missionTime: MissionTime): void {
    this.applyFaults(dt);

    const dtHours = dt / 3600;

    // Crew metabolic effects
    const crewO2Consumption = 0.84 * this.crewCount * dtHours;   // kg/hr per person
    const crewCO2Production = 1.0 * this.crewCount * dtHours;     // kg/hr per person
    const crewWaterConsumption = 0.12 * this.crewCount * dtHours;  // kg/hr per person
    const crewHumidityProduction = 0.05 * this.crewCount * dtHours;

    // Oxygen
    let o2 = this.parameters.get('oxygenPercent')!;
    const o2Reserve = this.parameters.get('o2ReserveKg')!;
    const o2Flow = this.parameters.get('o2FlowRate')!;

    // O2 consumed by crew → percent drops
    o2 -= crewO2Consumption * 0.5; // simplified: each kg consumed = 0.5% O2 drop

    // O2 system replenishes from reserve
    if (o2Reserve > 0 && o2 < 21.0) {
      const replenish = Math.min(o2Flow * dtHours, o2Reserve);
      o2 += replenish * 0.5;
      this.parameters.set('o2ReserveKg', o2Reserve - replenish);
    }
    this.parameters.set('oxygenPercent', Math.max(0, Math.min(100, o2)));

    // CO2
    let co2 = this.parameters.get('co2Ppm')!;
    co2 += crewCO2Production * 500; // simplified ppm increase

    // Scrubber removes CO2
    if (this.scrubberActive) {
      const scrubberEff = this.parameters.get('scrubberEfficiency')!;
      co2 -= co2 * scrubberEff * 0.1 * dt; // 10% of current CO2 per second at full efficiency
    }
    this.parameters.set('co2Ppm', Math.max(0, co2));

    // Cabin pressure
    let pressure = this.parameters.get('cabinPressureKpa')!;
    const leakRate = this.parameters.get('leakRateKpaPerHour')!;
    pressure -= leakRate * dtHours;
    this.parameters.set('cabinPressureKpa', Math.max(0, pressure));

    // Humidity
    let humidity = this.parameters.get('humidityPercent')!;
    humidity += crewHumidityProduction * 20;
    humidity -= humidity * 0.02 * dt; // dehumidifier
    this.parameters.set('humidityPercent', Math.max(0, Math.min(100, humidity)));

    // Water
    const water = this.parameters.get('waterReserveKg')!;
    this.parameters.set('waterReserveKg', Math.max(0, water - crewWaterConsumption));

    // Trace contaminants slowly build
    let trace = this.parameters.get('traceContaminantsPpm')!;
    trace += 0.01 * this.crewCount * dt;
    if (this.scrubberActive) {
      trace -= trace * 0.05 * dt;
    }
    this.parameters.set('traceContaminantsPpm', Math.max(0, trace));

    this.recordHistory('oxygenPercent', missionTime);
    this.recordHistory('co2Ppm', missionTime);
    this.recordHistory('cabinPressureKpa', missionTime);
    this.recordHistory('humidityPercent', missionTime);
    this.recordHistory('waterReserveKg', missionTime);

    this.deriveStatus();

    // Hard failure if O2 too low or pressure too low
    if (o2 < 15 || pressure < 60) {
      this.status = Status.Failed;
    }
  }
}
