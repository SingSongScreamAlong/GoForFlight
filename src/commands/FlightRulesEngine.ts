/**
 * Flight Rules Engine — the rulebook that governs what's acceptable.
 *
 * Evaluates rules against current state, tracks violations,
 * enforces GO/NO-GO criteria, handles overrides.
 */

import { EventBus } from '../core/EventBus.js';
import { SimulationManager } from '../core/SimulationManager.js';
import { EntityId, MissionPhase, Subsystem, Severity } from '../types/common.js';

export interface FlightRule {
  id: EntityId;
  name: string;
  description: string;
  explanation: string;            // plain-language "why this matters"
  subsystem: Subsystem;
  applicablePhases: MissionPhase[];
  severity: Severity;
  /** Condition that triggers violation. Returns true if rule is violated. */
  check: (sim: SimulationManager) => boolean;
  /** What happens if rule is violated and not overridden. */
  consequence: string;
  /** Can the Flight Director override this rule? */
  overridable: boolean;
}

interface RuleViolation {
  ruleId: EntityId;
  violatedAt: number;
  overridden: boolean;
  overriddenAt?: number;
}

export class FlightRulesEngine {
  private eventBus: EventBus;
  private simulation: SimulationManager;
  private rules: FlightRule[] = [];
  private violations = new Map<EntityId, RuleViolation>();
  private currentPhase: MissionPhase = MissionPhase.Prelaunch;
  private missionTime = 0;

  constructor(eventBus: EventBus, simulation: SimulationManager) {
    this.eventBus = eventBus;
    this.simulation = simulation;

    this.eventBus.on('phase:changed', (p) => {
      this.currentPhase = p.to;
    });

    this.eventBus.on('time:tick', (p) => {
      this.missionTime = p.missionTime;
      this.evaluate();
    });

    this.registerBuiltinRules();
  }

  /** Register a flight rule. */
  registerRule(rule: FlightRule): void {
    this.rules.push(rule);
  }

  /** Override a violated rule (Flight Director authority). */
  overrideRule(ruleId: EntityId): boolean {
    const violation = this.violations.get(ruleId);
    const rule = this.rules.find(r => r.id === ruleId);
    if (!violation || !rule?.overridable) return false;

    violation.overridden = true;
    violation.overriddenAt = this.missionTime;
    return true;
  }

  /** Get all current violations. */
  getViolations(): Array<{ rule: FlightRule; violation: RuleViolation }> {
    return Array.from(this.violations.entries())
      .map(([id, v]) => ({
        rule: this.rules.find(r => r.id === id)!,
        violation: v,
      }))
      .filter(x => x.rule !== undefined);
  }

  /** Get active (non-overridden) violations. */
  getActiveViolations(): Array<{ rule: FlightRule; violation: RuleViolation }> {
    return this.getViolations().filter(v => !v.violation.overridden);
  }

  /** Check if any blocking violations exist (for GO/NO-GO). */
  hasBlockingViolations(): boolean {
    return this.getActiveViolations().some(v => v.rule.severity === Severity.Critical || v.rule.severity === Severity.Warning);
  }

  /** Get all rules for a subsystem. */
  getRulesForSubsystem(subsystem: Subsystem): FlightRule[] {
    return this.rules.filter(r => r.subsystem === subsystem);
  }

  private evaluate(): void {
    const applicableRules = this.rules.filter(r =>
      r.applicablePhases.includes(this.currentPhase)
    );

    for (const rule of applicableRules) {
      const violated = rule.check(this.simulation);
      const existing = this.violations.get(rule.id);

      if (violated && !existing) {
        // New violation
        this.violations.set(rule.id, {
          ruleId: rule.id,
          violatedAt: this.missionTime,
          overridden: false,
        });
        this.eventBus.emit('flightRule:violated', {
          ruleId: rule.id,
          subsystem: rule.subsystem,
          description: rule.description,
        });
      } else if (!violated && existing) {
        // Violation cleared
        this.violations.delete(rule.id);
        this.eventBus.emit('flightRule:cleared', { ruleId: rule.id });
      }
    }
  }

  private registerBuiltinRules(): void {
    const allPhases = Object.values(MissionPhase);

    this.registerRule({
      id: 'rule_bus_voltage_low',
      name: 'Bus Voltage Low',
      description: 'Bus voltage below minimum for safe operations',
      explanation: 'Below 25V, avionics may begin to brown out and reset unpredictably.',
      subsystem: Subsystem.Power,
      applicablePhases: allPhases,
      severity: Severity.Warning,
      check: (sim) => {
        const power = sim.getSubsystem(Subsystem.Power);
        return (power?.getParameter('busVoltage') ?? 28) < 25;
      },
      consequence: 'Risk of avionics brownout. Load shedding required.',
      overridable: true,
    });

    this.registerRule({
      id: 'rule_o2_low',
      name: 'Oxygen Level Low',
      description: 'Cabin oxygen below safe threshold',
      explanation: 'Below 18% O2, crew will experience impaired judgment. Below 16%, loss of consciousness.',
      subsystem: Subsystem.ECLSS,
      applicablePhases: allPhases,
      severity: Severity.Critical,
      check: (sim) => {
        const eclss = sim.getSubsystem(Subsystem.ECLSS);
        return (eclss?.getParameter('oxygenPercent') ?? 21) < 18.5;
      },
      consequence: 'Crew safety at risk. Emergency O2 supply required.',
      overridable: false,
    });

    this.registerRule({
      id: 'rule_co2_high',
      name: 'CO2 Level High',
      description: 'Cabin CO2 above operational limit',
      explanation: 'Above 2500 ppm, crew will experience headaches and reduced performance.',
      subsystem: Subsystem.ECLSS,
      applicablePhases: allPhases,
      severity: Severity.Warning,
      check: (sim) => {
        const eclss = sim.getSubsystem(Subsystem.ECLSS);
        return (eclss?.getParameter('co2Ppm') ?? 400) > 2500;
      },
      consequence: 'Crew performance degraded. Scrubber intervention needed.',
      overridable: true,
    });

    this.registerRule({
      id: 'rule_attitude_unstable',
      name: 'Attitude Instability',
      description: 'Spacecraft attitude rates exceed safe limits',
      explanation: 'Uncontrolled rotation above 2°/s risks loss of comm lock and solar array damage.',
      subsystem: Subsystem.GNC,
      applicablePhases: allPhases,
      severity: Severity.Warning,
      check: (sim) => {
        const gnc = sim.getSubsystem(Subsystem.GNC);
        if (!gnc) return false;
        const roll = Math.abs(gnc.getParameter('rollRate') ?? 0);
        const pitch = Math.abs(gnc.getParameter('pitchRate') ?? 0);
        const yaw = Math.abs(gnc.getParameter('yawRate') ?? 0);
        return Math.max(roll, pitch, yaw) > 2;
      },
      consequence: 'Risk of comm loss and structural stress.',
      overridable: true,
    });

    this.registerRule({
      id: 'rule_hull_integrity_low',
      name: 'Hull Integrity Compromised',
      description: 'Structural integrity below safe margin',
      explanation: 'Below 70%, pressure vessel failure becomes a real risk.',
      subsystem: Subsystem.Structures,
      applicablePhases: allPhases,
      severity: Severity.Critical,
      check: (sim) => {
        const structures = sim.getSubsystem(Subsystem.Structures);
        return (structures?.getParameter('hullIntegrity') ?? 1) < 0.7;
      },
      consequence: 'Catastrophic failure possible. Abort consideration required.',
      overridable: false,
    });

    this.registerRule({
      id: 'rule_propellant_margin',
      name: 'Propellant Margin Low',
      description: 'Propellant reserves below minimum return margin',
      explanation: 'Without sufficient propellant margin, safe return trajectory may not be achievable.',
      subsystem: Subsystem.Propulsion,
      applicablePhases: [MissionPhase.Orbit, MissionPhase.Transfer, MissionPhase.Cruise],
      severity: Severity.Warning,
      check: (sim) => {
        const prop = sim.getSubsystem(Subsystem.Propulsion);
        return (prop?.getParameter('fuelRemaining') ?? 1) < 0.1;
      },
      consequence: 'Mission completion at risk. Consider return options.',
      overridable: true,
    });

    this.registerRule({
      id: 'rule_comm_loss',
      name: 'Loss of Signal',
      description: 'No communication with spacecraft',
      explanation: 'Without comm, we cannot send commands or receive telemetry.',
      subsystem: Subsystem.Communications,
      applicablePhases: allPhases,
      severity: Severity.Caution,
      check: (sim) => {
        const comms = sim.getSubsystem(Subsystem.Communications);
        return (comms?.getParameter('signalLocked') ?? 1) < 0.5;
      },
      consequence: 'Operating blind. Crew must follow pre-planned procedures.',
      overridable: true,
    });

    this.registerRule({
      id: 'rule_thermal_cabin',
      name: 'Cabin Temperature Out of Range',
      description: 'Cabin temperature outside habitable range',
      explanation: 'Outside 10-38°C, crew comfort degrades rapidly. Extreme temps are dangerous.',
      subsystem: Subsystem.Thermal,
      applicablePhases: allPhases,
      severity: Severity.Caution,
      check: (sim) => {
        const thermal = sim.getSubsystem(Subsystem.Thermal);
        const temp = thermal?.getParameter('cabinTemp') ?? 22;
        return temp < 10 || temp > 38;
      },
      consequence: 'Crew discomfort and performance impact.',
      overridable: true,
    });
  }
}
