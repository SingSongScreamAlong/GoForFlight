/**
 * Procedure definitions for Mission 01: First Orbit.
 *
 * Includes nominal procedures (launch checklist, orbit ops) and
 * off-nominal procedures for each anomaly in the pool.
 */

import { Subsystem } from '../types/common.js';
import { ProcedureDefinition } from '../types/procedure.js';

// ── Nominal Procedures ──────────────────────────────────────────

export const PROC_PRELAUNCH_CHECKLIST: ProcedureDefinition = {
  id: 'proc_prelaunch_checklist',
  name: 'Pre-Launch Systems Verification',
  category: 'nominal',
  description: 'Final systems check before committing to launch.',
  ownerSubsystem: Subsystem.Power,
  steps: [
    {
      index: 0,
      instruction: 'Verify all subsystems reporting nominal telemetry',
      explanation: 'Every system must be green before we commit to the countdown.',
      whyItMatters: 'Launching with a degraded system multiplies risk at every subsequent phase.',
      expectedResult: 'All 8 subsystems show NOMINAL status.',
      assignee: 'ground',
      requiresConfirmation: true,
    },
    {
      index: 1,
      instruction: 'Confirm propellant tank pressures within launch commit criteria',
      explanation: 'Fuel and oxidizer tank pressures must be within the narrow band for ignition.',
      expectedResult: 'Fuel: 2900-3500 kPa. Oxidizer: 3000-3600 kPa.',
      consequenceOfSkipping: 'Risk of engine start failure or off-nominal combustion.',
      assignee: 'ground',
      requiresConfirmation: true,
    },
    {
      index: 2,
      instruction: 'Verify power bus voltage and battery charge levels',
      expectedResult: 'Bus: 27-30V. All batteries above 95% charge.',
      assignee: 'ground',
      requiresConfirmation: true,
    },
    {
      index: 3,
      instruction: 'Confirm crew cabin environment: O2, CO2, pressure, humidity',
      expectedResult: 'O2: 20-21.5%. CO2: <1000 ppm. Pressure: 98-104 kPa.',
      assignee: 'ground',
      requiresConfirmation: true,
    },
    {
      index: 4,
      instruction: 'Verify comm link quality with spacecraft',
      expectedResult: 'Signal strength >80%. Packet loss <3%.',
      assignee: 'ground',
      requiresConfirmation: true,
    },
    {
      index: 5,
      instruction: 'Confirm GNC alignment and navigation solution',
      expectedResult: 'Sensor confidence >95%. IMU drift <0.05 deg/hr.',
      assignee: 'ground',
      requiresConfirmation: true,
    },
    {
      index: 6,
      instruction: 'Poll all stations: GO / NO-GO for launch',
      explanation: 'Each controller must verbally confirm their subsystem is ready.',
      whyItMatters: 'This is the final human check. Every station has authority to hold.',
      assignee: 'ground',
      requiresConfirmation: true,
    },
    {
      index: 7,
      instruction: 'Flight Director: give final GO / NO-GO for launch commit',
      whyItMatters: 'This is your call. Once you commit, the countdown proceeds to terminal count.',
      assignee: 'ground',
      requiresConfirmation: true,
    },
  ],
};

export const PROC_ORBIT_OPS: ProcedureDefinition = {
  id: 'proc_orbit_ops',
  name: 'Orbital Operations Checklist',
  category: 'nominal',
  description: 'Standard system checks after achieving stable orbit.',
  ownerSubsystem: Subsystem.GNC,
  steps: [
    {
      index: 0,
      instruction: 'Confirm orbital parameters: altitude, inclination, eccentricity',
      expectedResult: 'Within 1% of planned values.',
      assignee: 'ground',
      requiresConfirmation: true,
    },
    {
      index: 1,
      instruction: 'Deploy solar arrays to full extension',
      effects: [{ subsystem: Subsystem.Power, parameter: 'solarArrayOutput', operation: 'set', value: 1500 }],
      assignee: 'crew',
      requiresConfirmation: true,
    },
    {
      index: 2,
      instruction: 'Switch to orbital attitude profile',
      explanation: 'Transition from ascent attitude to orbital science/comm attitude.',
      assignee: 'ground',
      requiresConfirmation: false,
    },
    {
      index: 3,
      instruction: 'Crew: perform cabin pressure integrity check',
      explanation: 'Verify no pressure loss from ascent vibration.',
      expectedResult: 'Cabin pressure stable within 0.5 kPa over 5 minutes.',
      assignee: 'crew',
      requiresConfirmation: true,
    },
    {
      index: 4,
      instruction: 'Run GNC star tracker calibration',
      effects: [{ subsystem: Subsystem.GNC, parameter: 'imuDriftDegPerHour', operation: 'set', value: 0.01 }],
      assignee: 'ground',
      requiresConfirmation: false,
    },
    {
      index: 5,
      instruction: 'Verify thermal system: radiator status, zone temperatures',
      expectedResult: 'All thermal zones within nominal bands.',
      assignee: 'ground',
      requiresConfirmation: true,
    },
    {
      index: 6,
      instruction: 'Begin nominal mission timeline',
      assignee: 'ground',
      requiresConfirmation: true,
    },
  ],
};

export const PROC_DEORBIT_PREP: ProcedureDefinition = {
  id: 'proc_deorbit_prep',
  name: 'Deorbit Burn Preparation',
  category: 'nominal',
  description: 'Preparation steps for the deorbit burn and reentry.',
  ownerSubsystem: Subsystem.Propulsion,
  steps: [
    {
      index: 0,
      instruction: 'Stow all loose equipment in cabin. Crew restrain for deorbit.',
      assignee: 'crew',
      requiresConfirmation: true,
    },
    {
      index: 1,
      instruction: 'Verify deorbit burn parameters: ignition time, duration, delta-V',
      expectedResult: 'Burn solution verified by GNC. Propellant margin sufficient.',
      assignee: 'ground',
      requiresConfirmation: true,
    },
    {
      index: 2,
      instruction: 'Maneuver to deorbit burn attitude',
      effects: [{ subsystem: Subsystem.GNC, parameter: 'deviationFromPlanKm', operation: 'set', value: 0 }],
      assignee: 'ground',
      requiresConfirmation: true,
    },
    {
      index: 3,
      instruction: 'Arm main engine for deorbit burn',
      warningNote: 'Once armed, engine will fire at programmed ignition time unless manually aborted.',
      assignee: 'ground',
      requiresConfirmation: true,
    },
    {
      index: 4,
      instruction: 'Final GO/NO-GO poll for deorbit',
      assignee: 'ground',
      requiresConfirmation: true,
    },
    {
      index: 5,
      instruction: 'Execute deorbit burn',
      effects: [{ subsystem: Subsystem.Propulsion, parameter: 'thrustOutput', operation: 'set', value: 22000 }],
      assignee: 'ground',
      requiresConfirmation: true,
    },
  ],
};

// ── Off-Nominal Procedures (Anomaly Response) ───────────────────

export const PROC_THERMAL_SENSOR_VERIFY: ProcedureDefinition = {
  id: 'proc_thermal_sensor_verify',
  name: 'Thermal Sensor Verification',
  category: 'off_nominal',
  description: 'Verify whether a high thermal reading is a real temperature rise or a sensor fault.',
  ownerSubsystem: Subsystem.Thermal,
  applicableAnomalies: ['anomaly_thermal_sensor_drift'],
  steps: [
    {
      index: 0,
      instruction: 'Compare primary thermal sensor reading against backup sensor for same zone',
      explanation: 'If backup reads nominal while primary reads high, it\'s likely a sensor fault.',
      whyItMatters: 'Acting on a false reading wastes time and can cause unnecessary load shedding.',
      expectedResult: 'Backup sensor reads within nominal range, confirming sensor fault.',
      assignee: 'ground',
      requiresConfirmation: true,
      branches: [
        { label: 'Backup confirms high temp — real overheating', gotoStep: 5 },
        { label: 'Backup reads nominal — sensor fault', gotoStep: 1 },
      ],
    },
    {
      index: 1,
      instruction: 'Request crew visual check of avionics bay if accessible',
      explanation: 'A crew eyeball check can confirm whether equipment looks/feels hot.',
      assignee: 'crew',
      requiresConfirmation: true,
    },
    {
      index: 2,
      instruction: 'Switch to backup thermal sensor for affected zone',
      effects: [
        { subsystem: Subsystem.Thermal, parameter: 'avionicsTemp', operation: 'set', value: 35 },
      ],
      expectedResult: 'Readings return to nominal on backup sensor.',
      assignee: 'ground',
      requiresConfirmation: true,
    },
    {
      index: 3,
      instruction: 'If load shedding was triggered, reverse it',
      effects: [
        { subsystem: Subsystem.Power, parameter: 'totalLoadWatts', operation: 'set', value: 1200 },
      ],
      assignee: 'ground',
      requiresConfirmation: false,
    },
    {
      index: 4,
      instruction: 'Mark primary thermal sensor as failed. Continue on backup. Log anomaly.',
      expectedResult: 'Anomaly resolved. Thermal system nominal on backup sensor.',
      assignee: 'ground',
      requiresConfirmation: true,
    },
    // Branch: real overheating
    {
      index: 5,
      instruction: 'Initiate thermal load reduction — reduce non-essential system power draw',
      effects: [
        { subsystem: Subsystem.Power, parameter: 'totalLoadWatts', operation: 'multiply', value: 0.7 },
      ],
      warningNote: 'This will reduce some telemetry and science capability.',
      assignee: 'ground',
      requiresConfirmation: true,
    },
    {
      index: 6,
      instruction: 'Verify radiator deployment and effectiveness',
      expectedResult: 'Radiators at full deployment, efficiency >80%.',
      assignee: 'ground',
      requiresConfirmation: true,
    },
    {
      index: 7,
      instruction: 'Monitor temperature trend for 5 minutes. Confirm cooling.',
      expectedResult: 'Temperature stabilizing or decreasing.',
      assignee: 'ground',
      requiresConfirmation: true,
    },
  ],
};

export const PROC_COMM_ANTENNA_SWITCH: ProcedureDefinition = {
  id: 'proc_comm_antenna_switch',
  name: 'Communications Antenna Switch',
  category: 'off_nominal',
  description: 'Switch from primary to backup antenna when signal degrades.',
  ownerSubsystem: Subsystem.Communications,
  applicableAnomalies: ['anomaly_comm_signal_degradation'],
  steps: [
    {
      index: 0,
      instruction: 'Confirm signal degradation: check signal strength trend over last 2 minutes',
      explanation: 'Verify this is a real trend, not a momentary dip from attitude change.',
      expectedResult: 'Consistent downward trend in signal strength.',
      assignee: 'ground',
      requiresConfirmation: true,
    },
    {
      index: 1,
      instruction: 'Notify crew: prepare for possible comm gap during antenna handoff',
      assignee: 'ground',
      requiresConfirmation: false,
    },
    {
      index: 2,
      instruction: 'Command antenna switch: primary → backup',
      explanation: 'There will be a ~5 second comm gap during the switch.',
      effects: [
        { subsystem: Subsystem.Communications, parameter: 'signalStrength', operation: 'set', value: 0.8 },
        { subsystem: Subsystem.Communications, parameter: 'packetLossPercent', operation: 'set', value: 2 },
        { subsystem: Subsystem.Communications, parameter: 'bandwidthKbps', operation: 'set', value: 1600 },
      ],
      warningNote: 'Expect brief signal loss during handoff.',
      assignee: 'ground',
      requiresConfirmation: true,
    },
    {
      index: 3,
      instruction: 'Verify backup antenna lock. Confirm signal recovery.',
      expectedResult: 'Signal strength >70%. Packet loss <5%. Link stable.',
      assignee: 'ground',
      requiresConfirmation: true,
    },
    {
      index: 4,
      instruction: 'If backup also degraded, switch to omnidirectional mode',
      explanation: 'Lower bandwidth but guaranteed coverage. Accept reduced telemetry.',
      branches: [
        { label: 'Backup signal is good — procedure complete', gotoStep: 5 },
        { label: 'Backup also degraded — go omni', gotoStep: 6 },
      ],
      assignee: 'ground',
      requiresConfirmation: true,
    },
    {
      index: 5,
      instruction: 'Comm link restored on backup. Log primary antenna anomaly.',
      assignee: 'ground',
      requiresConfirmation: true,
    },
    {
      index: 6,
      instruction: 'Switch to omnidirectional antenna mode. Accept reduced bandwidth.',
      effects: [
        { subsystem: Subsystem.Communications, parameter: 'signalStrength', operation: 'set', value: 0.5 },
        { subsystem: Subsystem.Communications, parameter: 'bandwidthKbps', operation: 'set', value: 512 },
        { subsystem: Subsystem.Communications, parameter: 'packetLossPercent', operation: 'set', value: 5 },
      ],
      assignee: 'ground',
      requiresConfirmation: true,
    },
    {
      index: 7,
      instruction: 'Inform crew: operating on reduced bandwidth. Prioritize critical telemetry.',
      assignee: 'ground',
      requiresConfirmation: false,
    },
  ],
};

export const PROC_RCS_ISOLATION: ProcedureDefinition = {
  id: 'proc_rcs_isolation',
  name: 'RCS Quad Isolation and Rebalance',
  category: 'off_nominal',
  description: 'Isolate underperforming RCS quad and rebalance attitude control.',
  ownerSubsystem: Subsystem.Propulsion,
  applicableAnomalies: ['anomaly_rcs_quad_b_underperform'],
  steps: [
    {
      index: 0,
      instruction: 'Confirm RCS imbalance: compare quad thrust outputs A/B/C/D',
      explanation: 'Identify which quad is underperforming and by how much.',
      expectedResult: 'Quad B showing ~70% of nominal thrust. Others nominal.',
      assignee: 'ground',
      requiresConfirmation: true,
    },
    {
      index: 1,
      instruction: 'Assess attitude impact: check yaw rate trend and GNC compensation load',
      explanation: 'Determine how much propellant is being wasted compensating for the imbalance.',
      assignee: 'ground',
      requiresConfirmation: true,
    },
    {
      index: 2,
      instruction: 'Attempt RCS valve cycle on Quad B — close and reopen to clear potential obstruction',
      effects: [
        { subsystem: Subsystem.Propulsion, parameter: 'rcsQuadB', operation: 'set', value: 0 },
      ],
      warningNote: 'Quad B will be offline for ~10 seconds during valve cycle. GNC must compensate.',
      assignee: 'ground',
      requiresConfirmation: true,
      branches: [
        { label: 'Valve cycle restored performance', gotoStep: 5 },
        { label: 'Still underperforming — isolate quad', gotoStep: 3 },
      ],
    },
    {
      index: 3,
      instruction: 'Isolate Quad B. Reconfigure GNC for 3-quad attitude control.',
      effects: [
        { subsystem: Subsystem.Propulsion, parameter: 'rcsQuadB', operation: 'set', value: 0 },
        { subsystem: Subsystem.GNC, parameter: 'controlAuthority', operation: 'set', value: 0.75 },
      ],
      explanation: 'Three quads can maintain attitude but with reduced authority and higher propellant use.',
      assignee: 'ground',
      requiresConfirmation: true,
    },
    {
      index: 4,
      instruction: 'Recalculate propellant margins for remaining mission on 3 quads. Assess mission impact.',
      explanation: 'May need to cut optional objectives if propellant margin is tight.',
      expectedResult: 'Updated propellant budget. Determine if mission can continue as planned.',
      assignee: 'ground',
      requiresConfirmation: true,
    },
    // Branch: resolved
    {
      index: 5,
      instruction: 'Quad B restored to nominal. Verify yaw rate returning to zero. Resume normal ops.',
      effects: [
        { subsystem: Subsystem.Propulsion, parameter: 'rcsQuadB', operation: 'set', value: 1.0 },
        { subsystem: Subsystem.GNC, parameter: 'controlAuthority', operation: 'set', value: 1.0 },
      ],
      assignee: 'ground',
      requiresConfirmation: true,
    },
  ],
};

// ── Emergency Procedures ────────────────────────────────────────

export const PROC_EMERGENCY_CABIN_DEPRESS: ProcedureDefinition = {
  id: 'proc_emergency_cabin_depress',
  name: 'Emergency Cabin Depressurization Response',
  category: 'emergency',
  description: 'Immediate response to rapid cabin pressure loss.',
  ownerSubsystem: Subsystem.ECLSS,
  steps: [
    {
      index: 0,
      instruction: 'CREW: DON PRESSURE SUITS IMMEDIATELY',
      warningNote: 'TIME CRITICAL. Crew has limited time before hypoxia onset.',
      assignee: 'crew',
      requiresConfirmation: true,
    },
    {
      index: 1,
      instruction: 'Identify leak source: check pressure differential across compartments',
      assignee: 'ground',
      requiresConfirmation: true,
    },
    {
      index: 2,
      instruction: 'If leak source identified, attempt to isolate affected compartment',
      assignee: 'crew',
      requiresConfirmation: true,
      branches: [
        { label: 'Leak isolated — pressure stabilizing', gotoStep: 4 },
        { label: 'Cannot isolate — pressure still dropping', gotoStep: 3 },
      ],
    },
    {
      index: 3,
      instruction: 'ABORT CONSIDERATION: if pressure cannot be maintained, prepare for emergency return',
      warningNote: 'This may require an immediate deorbit burn.',
      assignee: 'ground',
      requiresConfirmation: true,
    },
    {
      index: 4,
      instruction: 'Monitor cabin pressure trend. Confirm leak rate is within suit life support duration.',
      expectedResult: 'Pressure stabilized or leak rate slow enough for mission continuation.',
      assignee: 'ground',
      requiresConfirmation: true,
    },
    {
      index: 5,
      instruction: 'Assess crew status: verify all crew suited and breathing normally',
      assignee: 'crew',
      requiresConfirmation: true,
    },
  ],
};

export const PROC_EMERGENCY_POWER_LOSS: ProcedureDefinition = {
  id: 'proc_emergency_power_loss',
  name: 'Emergency Power Loss Response',
  category: 'emergency',
  description: 'Response to bus voltage dropping below safe operating limits.',
  ownerSubsystem: Subsystem.Power,
  steps: [
    {
      index: 0,
      instruction: 'Activate emergency power mode — batteries only',
      effects: [{ subsystem: Subsystem.Power, parameter: 'emergencyPower', operation: 'set', value: 1 }],
      warningNote: 'Battery endurance is limited. Every minute counts.',
      assignee: 'ground',
      requiresConfirmation: true,
    },
    {
      index: 1,
      instruction: 'Initiate load shedding: drop all non-essential systems',
      effects: [
        { subsystem: Subsystem.Power, parameter: 'totalLoadWatts', operation: 'multiply', value: 0.5 },
        { subsystem: Subsystem.Power, parameter: 'loadShedding', operation: 'set', value: 1 },
      ],
      explanation: 'Keep only: ECLSS, comms, GNC, essential avionics. Drop science, secondary heating, non-critical telemetry.',
      assignee: 'ground',
      requiresConfirmation: true,
    },
    {
      index: 2,
      instruction: 'Diagnose power generation failure: check solar array status and connections',
      assignee: 'ground',
      requiresConfirmation: true,
      branches: [
        { label: 'Solar arrays can be restored', gotoStep: 3 },
        { label: 'Generation cannot be restored', gotoStep: 4 },
      ],
    },
    {
      index: 3,
      instruction: 'Attempt solar array recovery: repoint, reset, or switch to backup strings',
      effects: [{ subsystem: Subsystem.Power, parameter: 'solarArrayOutput', operation: 'set', value: 1000 }],
      assignee: 'ground',
      requiresConfirmation: true,
    },
    {
      index: 4,
      instruction: 'Calculate remaining battery endurance at current load. Plan for emergency return if needed.',
      warningNote: 'If endurance is less than time to next correction window, abort may be required.',
      assignee: 'ground',
      requiresConfirmation: true,
    },
  ],
};

export const MISSION_01_PROCEDURES: ProcedureDefinition[] = [
  PROC_PRELAUNCH_CHECKLIST,
  PROC_ORBIT_OPS,
  PROC_DEORBIT_PREP,
  PROC_THERMAL_SENSOR_VERIFY,
  PROC_COMM_ANTENNA_SWITCH,
  PROC_RCS_ISOLATION,
  PROC_EMERGENCY_CABIN_DEPRESS,
  PROC_EMERGENCY_POWER_LOSS,
];
