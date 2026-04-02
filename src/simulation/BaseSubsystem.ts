/**
 * Base class for subsystem simulations.
 * Handles common parameter storage, fault injection, history tracking, and status derivation.
 */

import { Subsystem, Status, MissionTime, ValueRange, TimestampedValue } from '../types/common.js';
import { SubsystemState, FaultState } from '../types/simulation.js';
import { SubsystemSimulation } from '../core/SimulationManager.js';

export abstract class BaseSubsystem implements SubsystemSimulation {
  abstract readonly subsystem: Subsystem;

  protected parameters = new Map<string, number>();
  protected nominalRanges = new Map<string, ValueRange>();
  protected faults: FaultState[] = [];
  protected history = new Map<string, TimestampedValue[]>();
  protected status: Status = Status.Nominal;

  private maxHistoryLength = 300; // ~5 minutes at 1Hz sampling

  /** Initialize parameters and ranges. */
  protected init(
    params: Record<string, number>,
    ranges: Record<string, ValueRange>,
  ): void {
    for (const [k, v] of Object.entries(params)) {
      this.parameters.set(k, v);
    }
    for (const [k, v] of Object.entries(ranges)) {
      this.nominalRanges.set(k, v);
    }
  }

  abstract tick(dt: number, missionTime: MissionTime): void;

  getState(): SubsystemState {
    return {
      subsystem: this.subsystem,
      status: this.status,
      parameters: new Map(this.parameters),
      nominalRanges: new Map(this.nominalRanges),
      faults: [...this.faults],
      history: new Map(this.history),
    };
  }

  getParameter(name: string): number | undefined {
    return this.parameters.get(name);
  }

  setParameter(name: string, value: number): void {
    this.parameters.set(name, value);
  }

  injectFault(fault: FaultState): void {
    this.faults.push(fault);
  }

  clearFault(faultId: string): void {
    this.faults = this.faults.filter(f => f.id !== faultId);
  }

  reset(): void {
    this.parameters.clear();
    this.faults = [];
    this.history.clear();
    this.status = Status.Nominal;
  }

  /** Record a parameter value in history for trend tracking. */
  protected recordHistory(param: string, missionTime: MissionTime): void {
    const value = this.parameters.get(param);
    if (value === undefined) return;

    let arr = this.history.get(param);
    if (!arr) {
      arr = [];
      this.history.set(param, arr);
    }
    arr.push({ time: missionTime, value });
    if (arr.length > this.maxHistoryLength) {
      arr.shift();
    }
  }

  /** Apply all active faults to parameters. */
  protected applyFaults(dt: number): void {
    for (const fault of this.faults) {
      fault.timeActive += dt;
      for (const param of fault.affectedParameters) {
        const current = this.parameters.get(param);
        if (current !== undefined) {
          // Faults drift the parameter by escalationRate * severity * dt
          const drift = fault.escalationRate * fault.severity * dt;
          this.parameters.set(param, current + drift);
        }
      }
    }
  }

  /** Derive overall status from parameter ranges. */
  protected deriveStatus(): void {
    let worstStatus = Status.Nominal;

    for (const [param, value] of this.parameters) {
      const range = this.nominalRanges.get(param);
      if (!range) continue;

      const paramStatus = this.evaluateParameterStatus(value, range);
      if (statusSeverity(paramStatus) > statusSeverity(worstStatus)) {
        worstStatus = paramStatus;
      }
    }

    // Faults can push status further
    if (this.faults.length > 0) {
      const maxFaultSeverity = Math.max(...this.faults.map(f => f.severity));
      if (maxFaultSeverity >= 0.8 && statusSeverity(worstStatus) < statusSeverity(Status.Critical)) {
        worstStatus = Status.Critical;
      } else if (maxFaultSeverity >= 0.5 && statusSeverity(worstStatus) < statusSeverity(Status.Warning)) {
        worstStatus = Status.Warning;
      }
    }

    this.status = worstStatus;
  }

  private evaluateParameterStatus(value: number, range: ValueRange): Status {
    if (value < range.min || value > range.max) return Status.Critical;

    if (range.warningMin !== undefined && value < range.warningMin) return Status.Warning;
    if (range.warningMax !== undefined && value > range.warningMax) return Status.Warning;

    if (range.cautionMin !== undefined && value < range.cautionMin) return Status.Caution;
    if (range.cautionMax !== undefined && value > range.cautionMax) return Status.Caution;

    if (range.nominalMin !== undefined && value < range.nominalMin) return Status.Advisory;
    if (range.nominalMax !== undefined && value > range.nominalMax) return Status.Advisory;

    return Status.Nominal;
  }
}

function statusSeverity(s: Status): number {
  const order: Record<Status, number> = {
    [Status.Nominal]: 0,
    [Status.Advisory]: 1,
    [Status.Caution]: 2,
    [Status.Warning]: 3,
    [Status.Critical]: 4,
    [Status.Failed]: 5,
    [Status.Unknown]: 3,
  };
  return order[s] ?? 0;
}
