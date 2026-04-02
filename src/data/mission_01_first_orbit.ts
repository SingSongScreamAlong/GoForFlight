/**
 * Mission 01: First Orbit — Tutorial/introductory mission.
 *
 * A straightforward Earth orbit mission to teach the player
 * the basics of mission control operations.
 */

import { MissionPhase, ObjectiveStatus, Subsystem } from '../types/common.js';
import { MissionDefinition } from '../types/mission.js';

export const MISSION_01_FIRST_ORBIT: MissionDefinition = {
  id: 'mission_01',
  name: 'First Orbit',
  description: 'Guide a crew through their first orbital mission. Learn the fundamentals of mission control.',

  briefing: {
    overview: 'This is a standard low-Earth orbit mission. Your crew will launch, achieve orbit, perform a series of system checks, and return safely. As Flight Director, you are responsible for all GO/NO-GO decisions.',
    goals: [
      'Successfully launch and achieve stable orbit',
      'Complete all system checks in orbit',
      'Return crew safely to Earth',
    ],
    vehicleNotes: 'Standard crew vehicle in good condition. All systems nominal at pad.',
    crewNotes: 'Experienced commander with two first-time crew members.',
    knownRisks: [
      'Weather window is tight — launch hold possible',
      'Minor thermal sensor calibration issue noted during preflight',
    ],
  },

  phases: [
    {
      phase: MissionPhase.Prelaunch,
      durationSeconds: 120,
      description: 'Final checks and GO/NO-GO poll',
      autoAdvance: false,
    },
    {
      phase: MissionPhase.Countdown,
      durationSeconds: 60,
      description: 'Terminal countdown',
      autoAdvance: true,
    },
    {
      phase: MissionPhase.Ascent,
      durationSeconds: 510, // ~8.5 minutes
      description: 'Powered ascent to orbit',
      autoAdvance: true,
    },
    {
      phase: MissionPhase.Orbit,
      durationSeconds: 1800, // 30 minutes game time
      description: 'Orbital operations and system checks',
      autoAdvance: false,
    },
    {
      phase: MissionPhase.Reentry,
      durationSeconds: 600,
      description: 'Deorbit burn and atmospheric reentry',
      autoAdvance: true,
    },
    {
      phase: MissionPhase.Recovery,
      durationSeconds: 120,
      description: 'Parachute deploy and splashdown',
      autoAdvance: true,
    },
  ],

  objectives: [
    {
      id: 'obj_launch',
      name: 'Successful Launch',
      description: 'Complete countdown and achieve powered flight',
      type: 'primary',
      initialStatus: ObjectiveStatus.Active,
      successConditions: [{ type: 'phase', params: { phase: MissionPhase.Ascent } }],
    },
    {
      id: 'obj_orbit',
      name: 'Achieve Stable Orbit',
      description: 'Reach orbital velocity and confirm stable orbit',
      type: 'primary',
      initialStatus: ObjectiveStatus.Inactive,
      successConditions: [{ type: 'phase', params: { phase: MissionPhase.Orbit } }],
      phaseRequired: MissionPhase.Ascent,
    },
    {
      id: 'obj_checks',
      name: 'Complete System Checks',
      description: 'Run through all orbital system verification procedures',
      type: 'primary',
      initialStatus: ObjectiveStatus.Inactive,
      successConditions: [
        { type: 'objective_status', params: { objectiveId: 'obj_orbit', status: ObjectiveStatus.Completed } },
      ],
      phaseRequired: MissionPhase.Orbit,
    },
    {
      id: 'obj_return',
      name: 'Safe Return',
      description: 'Successfully deorbit and recover the crew',
      type: 'primary',
      initialStatus: ObjectiveStatus.Inactive,
      successConditions: [{ type: 'phase', params: { phase: MissionPhase.Recovery } }],
      phaseRequired: MissionPhase.Reentry,
    },
    {
      id: 'obj_photo',
      name: 'Earth Photography',
      description: 'Have crew photograph Earth from orbit — optional public engagement objective',
      type: 'secondary',
      initialStatus: ObjectiveStatus.Inactive,
      successConditions: [],
      phaseRequired: MissionPhase.Orbit,
      reward: 'Public confidence +10',
    },
  ],

  crewManifest: [
    {
      id: 'crew_commander',
      name: 'Commander Harris',
      role: 'Commander',
      baseFatigue: 0.1,
      baseStress: 0.15,
      baseTrust: 0.8,
      strengths: ['calm under pressure', 'experienced EVA'],
      personality: 'Steady and professional. Trusts ground control but will push back if something feels wrong.',
    },
    {
      id: 'crew_pilot',
      name: 'Pilot Reeves',
      role: 'Pilot',
      baseFatigue: 0.15,
      baseStress: 0.25,
      baseTrust: 0.7,
      strengths: ['fast reactions', 'strong systems knowledge'],
      personality: 'Eager first-timer. Asks a lot of questions. High energy but can get overwhelmed.',
    },
    {
      id: 'crew_specialist',
      name: 'Mission Specialist Okafor',
      role: 'Mission Specialist',
      baseFatigue: 0.12,
      baseStress: 0.2,
      baseTrust: 0.75,
      strengths: ['science operations', 'medical training'],
      personality: 'Methodical and detail-oriented. Will report anomalies early.',
    },
  ],

  controllerRoster: [
    {
      id: 'ctrl_booster',
      name: 'Marcus Chen',
      callsign: 'BOOSTER',
      subsystem: Subsystem.Propulsion,
      baseTrust: 0.7,
      riskTolerance: 0.4,
      confidenceStyle: 'cautious',
      personality: 'Conservative. Would rather hold than risk a bad burn.',
    },
    {
      id: 'ctrl_eecom',
      name: 'Sarah Okonjo',
      callsign: 'EECOM',
      subsystem: Subsystem.ECLSS,
      baseTrust: 0.75,
      riskTolerance: 0.5,
      confidenceStyle: 'balanced',
      personality: 'Calm and thorough. Excellent at trend analysis.',
    },
    {
      id: 'ctrl_gnc',
      name: 'David Park',
      callsign: 'GNC',
      subsystem: Subsystem.GNC,
      baseTrust: 0.65,
      riskTolerance: 0.3,
      confidenceStyle: 'cautious',
      personality: 'Numbers-focused. Will flag anything outside nominal bands.',
    },
    {
      id: 'ctrl_electrical',
      name: 'Raj Patel',
      callsign: 'EGIL',
      subsystem: Subsystem.Power,
      baseTrust: 0.8,
      riskTolerance: 0.6,
      confidenceStyle: 'balanced',
      personality: 'Experienced and confident. Knows the power system inside out.',
    },
    {
      id: 'ctrl_thermal',
      name: 'Lisa Tran',
      callsign: 'THERMAL',
      subsystem: Subsystem.Thermal,
      baseTrust: 0.7,
      riskTolerance: 0.5,
      confidenceStyle: 'balanced',
      personality: 'Quiet but precise. Speaks up when it matters.',
    },
    {
      id: 'ctrl_inco',
      name: 'James Oduya',
      callsign: 'INCO',
      subsystem: Subsystem.Communications,
      baseTrust: 0.75,
      riskTolerance: 0.5,
      confidenceStyle: 'balanced',
      personality: 'Quick-thinking. Good at improvising when comms get rough.',
    },
  ],

  anomalyPool: [
    'anomaly_thermal_sensor_drift',
    'anomaly_comm_signal_degradation',
    'anomaly_rcs_quad_b_underperform',
  ],

  scriptedEvents: [
    {
      id: 'event_countdown_start',
      triggerPhase: MissionPhase.Countdown,
      eventType: 'dialogue',
      payload: {
        controllerId: 'ctrl_booster',
        text: 'BOOSTER is GO for launch.',
        type: 'callout',
      },
      once: true,
    },
    {
      id: 'event_orbit_achieved',
      triggerPhase: MissionPhase.Orbit,
      eventType: 'dialogue',
      payload: {
        controllerId: 'ctrl_gnc',
        text: 'GNC confirms good orbit. Tracking nominal on all axes.',
        type: 'confirmation',
      },
      once: true,
    },
  ],

  successConditions: [
    {
      type: 'compound_and',
      params: {
        conditions: [
          { type: 'phase', params: { phase: MissionPhase.Recovery } },
          { type: 'objective_status', params: { objectiveId: 'obj_return', status: ObjectiveStatus.Completed } },
        ],
      },
    },
  ],

  failureConditions: [
    { type: 'subsystem_status', params: { subsystem: Subsystem.ECLSS, status: 'failed' } },
    { type: 'subsystem_status', params: { subsystem: Subsystem.Power, status: 'failed' } },
    { type: 'subsystem_status', params: { subsystem: Subsystem.Structures, status: 'failed' } },
  ],

  initialSubsystemStates: {
    [Subsystem.Propulsion]: {
      parameters: {
        thrustOutput: 0, chamberPressure: 0, fuelTankPressure: 3200,
        oxTankPressure: 3400, fuelRemaining: 1.0, oxRemaining: 1.0,
      },
      nominalRanges: {
        chamberPressure: { min: 0, max: 4000, nominalMin: 2800, nominalMax: 3200 },
        fuelTankPressure: { min: 0, max: 4000, nominalMin: 2900, nominalMax: 3500 },
      },
    },
    [Subsystem.Power]: {
      parameters: {
        busVoltage: 28.5, totalLoadWatts: 1200, batteryCharge: 1.0,
      },
      nominalRanges: {
        busVoltage: { min: 24, max: 32, nominalMin: 27, nominalMax: 30 },
      },
    },
    [Subsystem.Thermal]: {
      parameters: {
        cabinTemp: 22, avionicsBayTemp: 35, radiatorEfficiency: 0.95,
      },
      nominalRanges: {
        cabinTemp: { min: 15, max: 30, nominalMin: 20, nominalMax: 25 },
      },
    },
    [Subsystem.ECLSS]: {
      parameters: {
        oxygenPercent: 20.9, co2Ppm: 400, cabinPressureKpa: 101.3,
        humidityPercent: 45, waterReserveKg: 50,
      },
      nominalRanges: {
        oxygenPercent: { min: 19.5, max: 23.5, nominalMin: 20.0, nominalMax: 21.5 },
        co2Ppm: { min: 0, max: 5000, nominalMin: 0, nominalMax: 1000, cautionMax: 2500 },
      },
    },
    [Subsystem.Communications]: {
      parameters: {
        signalStrength: 0.95, bandwidthKbps: 2048, packetLoss: 0.01,
      },
      nominalRanges: {
        signalStrength: { min: 0, max: 1, nominalMin: 0.7, nominalMax: 1.0 },
      },
    },
    [Subsystem.GNC]: {
      parameters: {
        sensorConfidence: 0.98, imuDrift: 0.001, deviationKm: 0,
      },
      nominalRanges: {
        sensorConfidence: { min: 0, max: 1, nominalMin: 0.9, nominalMax: 1.0 },
      },
    },
    [Subsystem.Structures]: {
      parameters: {
        hullIntegrity: 1.0, vibrationG: 0, sealIntegrity: 1.0,
      },
      nominalRanges: {
        hullIntegrity: { min: 0, max: 1, nominalMin: 0.95, nominalMax: 1.0 },
      },
    },
    [Subsystem.Crew]: {
      parameters: {
        avgFatigue: 0.12, avgStress: 0.2, avgTrust: 0.75,
      },
      nominalRanges: {
        avgFatigue: { min: 0, max: 1, nominalMin: 0, nominalMax: 0.5, cautionMax: 0.7 },
        avgStress: { min: 0, max: 1, nominalMin: 0, nominalMax: 0.5, cautionMax: 0.7 },
      },
    },
  },

  difficulty: {
    anomalyFrequency: 0.3,
    anomalyAmbiguity: 0.2,
    cascadeSpeed: 0.3,
    resourceMargins: 0.7,
    controllerHintQuality: 0.8,
  },
};
