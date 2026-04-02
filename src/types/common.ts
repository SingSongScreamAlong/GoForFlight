/**
 * Common types used across all game systems.
 */

/** Unique identifier for any game entity */
export type EntityId = string;

/** Milliseconds since mission start */
export type MissionTime = number;

/** Real wall-clock milliseconds */
export type RealTime = number;

/** A value between 0.0 and 1.0 representing a percentage */
export type Fraction = number;

/** Severity levels used by alerts, anomalies, and flight rules */
export enum Severity {
  Info = 'info',
  Caution = 'caution',
  Warning = 'warning',
  Critical = 'critical',
}

/** Top-level game states */
export enum GameState {
  Boot = 'boot',
  MainMenu = 'main_menu',
  MissionBrief = 'mission_brief',
  MissionActive = 'mission_active',
  MissionPaused = 'mission_paused',
  MissionDebrief = 'mission_debrief',
  Settings = 'settings',
  ProfileSelect = 'profile_select',
}

/** Mission phases — the backbone of timeline progression */
export enum MissionPhase {
  Prelaunch = 'prelaunch',
  Countdown = 'countdown',
  Ascent = 'ascent',
  Orbit = 'orbit',
  Transfer = 'transfer',
  Cruise = 'cruise',
  FlybyOps = 'flyby_ops',
  OrbitOps = 'orbit_ops',
  Return = 'return',
  Reentry = 'reentry',
  Recovery = 'recovery',
  Complete = 'complete',
  Aborted = 'aborted',
}

/** Subsystem identifiers — the domains controllers own */
export enum Subsystem {
  Propulsion = 'propulsion',
  Power = 'power',
  Thermal = 'thermal',
  ECLSS = 'eclss',
  Communications = 'comms',
  GNC = 'gnc',
  Structures = 'structures',
  Crew = 'crew',
}

/** Status of any trackable item */
export enum Status {
  Nominal = 'nominal',
  Advisory = 'advisory',
  Caution = 'caution',
  Warning = 'warning',
  Critical = 'critical',
  Failed = 'failed',
  Unknown = 'unknown',
}

/** GO/NO-GO states for polling */
export enum GoNoGo {
  Go = 'go',
  NoGo = 'no_go',
  Standby = 'standby',
}

/** Objective completion states */
export enum ObjectiveStatus {
  Inactive = 'inactive',
  Active = 'active',
  Completed = 'completed',
  Failed = 'failed',
  Skipped = 'skipped',
}

/** A range with min/max and optional nominal band */
export interface ValueRange {
  min: number;
  max: number;
  nominalMin?: number;
  nominalMax?: number;
  cautionMin?: number;
  cautionMax?: number;
  warningMin?: number;
  warningMax?: number;
}

/** A timestamped value for trend tracking */
export interface TimestampedValue<T = number> {
  time: MissionTime;
  value: T;
}
