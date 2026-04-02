/**
 * Anomaly definitions for Mission 01: First Orbit.
 *
 * Three anomalies in the pool:
 *   1. Thermal sensor drift — subtle, good for teaching diagnosis
 *   2. Comm signal degradation — creates tension, limits player info
 *   3. RCS quad B underperformance — affects GNC, has cascade potential
 */

import { MissionPhase, Subsystem } from '../types/common.js';
import { AnomalyDefinition } from '../types/anomaly.js';

/** Thermal sensor in avionics bay begins drifting high. Looks like overheating
 *  but it's actually a sensor fault. The real temperature is fine. Classic
 *  misdiagnosis trap — do you start load shedding for a problem that doesn't exist? */
export const ANOMALY_THERMAL_SENSOR_DRIFT: AnomalyDefinition = {
  id: 'anomaly_thermal_sensor_drift',
  name: 'Avionics Bay Thermal Sensor Drift',
  description: 'Temperature sensor in avionics bay begins reading high. Actual temperature is nominal — the sensor is failing.',
  category: 'sensor',
  triggerConditions: [
    { type: 'phase', params: { phase: MissionPhase.Orbit } },
  ],
  visibleSymptoms: [
    {
      subsystem: Subsystem.Thermal,
      parameter: 'avionicsTemp',
      effect: 'drift',
      magnitude: 0.5,          // degrees per second of drift
      delaySeconds: 0,
      confidenceToDetect: 0.3, // easy to spot the reading, hard to diagnose as sensor fault
    },
  ],
  hiddenParameters: {
    actualTemp: 35,            // real temp stays nominal
    sensorBias: 0,             // grows over time
  },
  escalationPath: [
    {
      level: 1,
      delaySeconds: 60,
      description: 'Sensor reading climbs past caution threshold',
      severityAtLevel: 'caution' as any,
    },
    {
      level: 2,
      delaySeconds: 180,
      description: 'Sensor reading hits warning threshold. THERMAL controller flags it.',
      severityAtLevel: 'warning' as any,
      newSymptoms: [
        {
          subsystem: Subsystem.Thermal,
          parameter: 'avionicsTemp',
          effect: 'noise',
          magnitude: 2,
          delaySeconds: 0,
          confidenceToDetect: 0.6, // noise makes it look more like a real problem
        },
      ],
    },
    {
      level: 3,
      delaySeconds: 360,
      description: 'If not addressed, triggers automatic load shedding (unnecessary)',
      severityAtLevel: 'warning' as any,
      cascadeTargets: [
        {
          subsystem: Subsystem.Power,
          effect: 'totalLoadWatts',
          magnitude: -300,    // load shedding kicks in, cutting power unnecessarily
          delay: 5,
        },
      ],
    },
  ],
  affectedSubsystems: [Subsystem.Thermal, Subsystem.Power],
  recommendedProcedures: ['proc_thermal_sensor_verify'],
  possibleMisdiagnoses: ['anomaly_actual_overheat'],
  resolutionStates: ['sensor_recalibrated', 'switched_to_backup_sensor', 'load_shedding_reversed'],
  difficultyWeight: 0.3,
  allowedPhases: [MissionPhase.Orbit, MissionPhase.Transfer, MissionPhase.Cruise],
};

/** Ground station handoff causes progressive signal degradation. Antenna
 *  pointing drifts slightly, reducing bandwidth and increasing packet loss.
 *  If it gets bad enough, you lose telemetry and have to fly partially blind. */
export const ANOMALY_COMM_SIGNAL_DEGRADATION: AnomalyDefinition = {
  id: 'anomaly_comm_signal_degradation',
  name: 'Communications Signal Degradation',
  description: 'Progressive loss of signal strength during ground station handoff. Antenna tracking is drifting.',
  category: 'mechanical',
  triggerConditions: [
    { type: 'phase', params: { phase: MissionPhase.Orbit } },
  ],
  visibleSymptoms: [
    {
      subsystem: Subsystem.Communications,
      parameter: 'signalStrength',
      effect: 'drift',
      magnitude: -0.02,         // slow degradation per second
      delaySeconds: 0,
      confidenceToDetect: 0.5,
    },
    {
      subsystem: Subsystem.Communications,
      parameter: 'packetLossPercent',
      effect: 'drift',
      magnitude: 0.1,
      delaySeconds: 30,         // packet loss starts showing up after 30s
      confidenceToDetect: 0.4,
    },
  ],
  hiddenParameters: {
    antennaMisalignment: 0.1,  // degrees, growing
    handoffFailure: 1,
  },
  escalationPath: [
    {
      level: 1,
      delaySeconds: 45,
      description: 'Signal drops below 80%. INCO notices degraded link quality.',
      severityAtLevel: 'caution' as any,
    },
    {
      level: 2,
      delaySeconds: 120,
      description: 'Signal below 50%. Telemetry gaps appearing. INCO recommends antenna switch.',
      severityAtLevel: 'warning' as any,
      newSymptoms: [
        {
          subsystem: Subsystem.Communications,
          parameter: 'bandwidthKbps',
          effect: 'drift',
          magnitude: -10,
          delaySeconds: 0,
          confidenceToDetect: 0.7,
        },
      ],
    },
    {
      level: 3,
      delaySeconds: 240,
      description: 'Signal below 20%. Loss of reliable command uplink. Crew on stored program.',
      severityAtLevel: 'critical' as any,
      cascadeTargets: [
        {
          subsystem: Subsystem.GNC,
          effect: 'sensorConfidence',
          magnitude: -0.1,   // can\'t get ground-based nav updates
          delay: 10,
        },
      ],
    },
  ],
  affectedSubsystems: [Subsystem.Communications, Subsystem.GNC],
  recommendedProcedures: ['proc_comm_antenna_switch', 'proc_comm_backup_mode'],
  possibleMisdiagnoses: ['anomaly_antenna_physical_damage'],
  resolutionStates: ['antenna_switched', 'tracking_recalibrated', 'handoff_completed'],
  difficultyWeight: 0.5,
  allowedPhases: [MissionPhase.Orbit, MissionPhase.Transfer, MissionPhase.Cruise, MissionPhase.Return],
};

/** One RCS thruster quad is delivering 70% of expected thrust. Causes a yaw
 *  bias that GNC has to compensate for. If unaddressed, burns through RCS
 *  propellant faster and could destabilize attitude during a main engine burn. */
export const ANOMALY_RCS_QUAD_B: AnomalyDefinition = {
  id: 'anomaly_rcs_quad_b_underperform',
  name: 'RCS Quad B Underperformance',
  description: 'RCS thruster quad B delivering reduced thrust. Causes attitude control imbalance.',
  category: 'mechanical',
  triggerConditions: [
    { type: 'phase', params: { phase: MissionPhase.Orbit } },
  ],
  visibleSymptoms: [
    {
      subsystem: Subsystem.Propulsion,
      parameter: 'rcsQuadB',
      effect: 'offset',
      magnitude: -0.3,         // quad B at 70% instead of 100%
      delaySeconds: 0,
      confidenceToDetect: 0.4,
    },
    {
      subsystem: Subsystem.GNC,
      parameter: 'yawRate',
      effect: 'drift',
      magnitude: 0.005,        // slow yaw drift from asymmetric thrust
      delaySeconds: 10,
      confidenceToDetect: 0.5,
    },
  ],
  hiddenParameters: {
    valveRestriction: 0.3,     // 30% flow restriction
    propellantWasteRate: 1.3,  // burning 30% more propellant to compensate
  },
  escalationPath: [
    {
      level: 1,
      delaySeconds: 30,
      description: 'GNC compensating for yaw bias. Propellant usage slightly elevated.',
      severityAtLevel: 'caution' as any,
    },
    {
      level: 2,
      delaySeconds: 120,
      description: 'Persistent yaw bias. BOOSTER and GNC both flag it. RCS propellant margin dropping.',
      severityAtLevel: 'warning' as any,
      newSymptoms: [
        {
          subsystem: Subsystem.Propulsion,
          parameter: 'fuelRemaining',
          effect: 'drift',
          magnitude: -0.001,     // accelerated propellant consumption
          delaySeconds: 0,
          confidenceToDetect: 0.6,
        },
      ],
    },
    {
      level: 3,
      delaySeconds: 300,
      description: 'If a main engine burn is attempted, asymmetric RCS compensation may not be sufficient.',
      severityAtLevel: 'warning' as any,
      cascadeTargets: [
        {
          subsystem: Subsystem.Structures,
          effect: 'vibrationG',
          magnitude: 0.5,      // vibration from asymmetric control
          delay: 0,
        },
        {
          subsystem: Subsystem.Crew,
          effect: 'avgStress',
          magnitude: 0.05,     // crew notices the wobble
          delay: 15,
        },
      ],
    },
  ],
  affectedSubsystems: [Subsystem.Propulsion, Subsystem.GNC, Subsystem.Structures, Subsystem.Crew],
  recommendedProcedures: ['proc_rcs_isolation', 'proc_attitude_rebalance'],
  possibleMisdiagnoses: ['anomaly_gnc_imu_drift', 'anomaly_structural_imbalance'],
  resolutionStates: ['quad_isolated', 'valve_cleared', 'compensated_with_other_quads'],
  difficultyWeight: 0.6,
  allowedPhases: [MissionPhase.Orbit, MissionPhase.Transfer, MissionPhase.Return],
};

export const MISSION_01_ANOMALIES: AnomalyDefinition[] = [
  ANOMALY_THERMAL_SENSOR_DRIFT,
  ANOMALY_COMM_SIGNAL_DEGRADATION,
  ANOMALY_RCS_QUAD_B,
];
