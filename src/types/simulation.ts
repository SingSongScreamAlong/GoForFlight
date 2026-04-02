/**
 * Simulation state schemas for all subsystems.
 */

import { Fraction, Status, Subsystem, TimestampedValue, ValueRange } from './common.js';

// ── Base simulation types ─────────────────────────────────────────

export interface SubsystemState {
  subsystem: Subsystem;
  status: Status;
  parameters: Map<string, number>;
  nominalRanges: Map<string, ValueRange>;
  faults: FaultState[];
  history: Map<string, TimestampedValue[]>;
}

export interface FaultState {
  id: string;
  hidden: boolean;
  severity: number;
  affectedParameters: string[];
  escalationRate: number;
  timeActive: number;
}

// ── Propulsion ────────────────────────────────────────────────────

export interface PropulsionState {
  mainEngineActive: boolean;
  thrustOutput: number;           // Newtons
  chamberPressure: number;        // kPa
  fuelTankPressure: number;       // kPa
  oxTankPressure: number;         // kPa
  fuelLinePressure: number;       // kPa
  oxLinePressure: number;         // kPa
  fuelRemaining: Fraction;
  oxRemaining: Fraction;
  rcsActive: boolean;
  rcsQuadStatus: [Status, Status, Status, Status];
  leakRate: number;               // kg/s, 0 = no leak
  valveStates: Map<string, 'open' | 'closed' | 'stuck'>;
}

// ── Power ─────────────────────────────────────────────────────────

export interface PowerState {
  busVoltage: number;             // V
  busStable: boolean;
  totalLoadWatts: number;
  totalGenerationWatts: number;
  batteries: BatteryState[];
  subsystemPowerDraw: Map<Subsystem, number>;
  emergencyPowerMode: boolean;
  loadSheddingActive: boolean;
}

export interface BatteryState {
  id: string;
  chargeLevel: Fraction;
  healthFraction: Fraction;
  charging: boolean;
  discharging: boolean;
  temperatureCelsius: number;
}

// ── Thermal ───────────────────────────────────────────────────────

export interface ThermalState {
  zones: ThermalZone[];
  radiatorEffectiveness: Fraction;
  inSunlight: boolean;
  eclipseFraction: Fraction;
}

export interface ThermalZone {
  id: string;
  name: string;
  temperatureCelsius: number;
  heatGeneration: number;         // Watts
  heatTransferRate: number;       // W/K
  nominalRange: ValueRange;
  isHotspot: boolean;
}

// ── ECLSS ─────────────────────────────────────────────────────────

export interface ECLSSState {
  oxygenLevelPercent: number;
  co2LevelPpm: number;
  cabinPressureKpa: number;
  humidityPercent: number;
  traceContaminantsPpm: number;
  waterReserveKg: number;
  scrubberEfficiency: Fraction;
  leakRateKpaPerHour: number;
}

// ── Communications ────────────────────────────────────────────────

export interface CommsState {
  signalLocked: boolean;
  signalStrength: Fraction;
  bandwidthKbps: number;
  packetLossPercent: number;
  delaySeconds: number;
  antennaMode: 'primary' | 'backup' | 'omnidirectional';
  inBlackout: boolean;
  degradedTelemetry: boolean;
}

// ── GNC ───────────────────────────────────────────────────────────

export interface GNCState {
  attitudeQuaternion: [number, number, number, number];
  attitudeRateDegPerSec: [number, number, number]; // roll, pitch, yaw rates
  sensorConfidence: Fraction;
  imuDriftDegPerHour: number;
  starTrackerActive: boolean;
  onTargetTrajectory: boolean;
  deviationFromPlanKm: number;
  nextCorrectionWindowSeconds: number;
  controlStable: boolean;
}

// ── Structures ────────────────────────────────────────────────────

export interface StructuresState {
  hullIntegrity: Fraction;
  vibrationLevel: number;         // g
  thermalStressFraction: Fraction;
  impactDamage: boolean;
  sealIntegrity: Fraction;
  compartments: CompartmentState[];
}

export interface CompartmentState {
  id: string;
  name: string;
  integrity: Fraction;
  pressurized: boolean;
  accessible: boolean;
}

// ── Crew ──────────────────────────────────────────────────────────

export interface CrewMemberState {
  id: string;
  fatigue: Fraction;
  stress: Fraction;
  trust: Fraction;
  cognitivePerformance: Fraction;
  healthStatus: 'healthy' | 'symptomatic' | 'impaired' | 'incapacitated';
  symptoms: string[];
  responseDelayMultiplier: number;
  taskSuccessProbability: Fraction;
}

// ── Resources ─────────────────────────────────────────────────────

export interface ResourceState {
  propellantMargin: Fraction;
  batteryReserve: Fraction;
  oxygenReserve: Fraction;
  waterReserve: Fraction;
  thermalMargin: Fraction;
  scheduleMarginSeconds: number;
  maneuverWindowMarginSeconds: number;
  publicConfidence?: Fraction;
}
