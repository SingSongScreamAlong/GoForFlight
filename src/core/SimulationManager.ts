/**
 * Master Simulation Layer — coordinates all subsystem simulations.
 *
 * Manages the shared tick/update model, system dependency graph,
 * and cross-system influence handling.
 */

import { EventBus } from './EventBus.js';
import { Subsystem, Status, MissionTime } from '../types/common.js';
import { SubsystemState, FaultState } from '../types/simulation.js';

/** Interface that all subsystem simulations must implement. */
export interface SubsystemSimulation {
  readonly subsystem: Subsystem;

  /** Called each fixed timestep. */
  tick(dt: number, missionTime: MissionTime): void;

  /** Get current subsystem state for UI/telemetry. */
  getState(): SubsystemState;

  /** Get a specific parameter value. */
  getParameter(name: string): number | undefined;

  /** Set a parameter (for commands, procedures, anomaly effects). */
  setParameter(name: string, value: number): void;

  /** Inject a fault into this subsystem. */
  injectFault(fault: FaultState): void;

  /** Remove a fault. */
  clearFault(faultId: string): void;

  /** Reset to initial state. */
  reset(): void;
}

/** Dependency edge: subsystem A influences subsystem B */
interface DependencyEdge {
  from: Subsystem;
  to: Subsystem;
  /** How the source influences the target */
  apply: (source: SubsystemSimulation, target: SubsystemSimulation) => void;
}

export class SimulationManager {
  private eventBus: EventBus;
  private subsystems = new Map<Subsystem, SubsystemSimulation>();
  private dependencies: DependencyEdge[] = [];
  private tickOrder: Subsystem[] = [];
  private previousStatuses = new Map<Subsystem, Status>();

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;

    // Subscribe to simulation ticks
    this.eventBus.on('time:tick', (payload) => {
      this.tick(payload.dt, payload.missionTime);
    });
  }

  /** Register a subsystem simulation. */
  register(sim: SubsystemSimulation): void {
    this.subsystems.set(sim.subsystem, sim);
    this.previousStatuses.set(sim.subsystem, sim.getState().status);
    this.rebuildTickOrder();
  }

  /** Define a cross-system dependency. */
  addDependency(edge: DependencyEdge): void {
    this.dependencies.push(edge);
    this.rebuildTickOrder();
  }

  /** Get a registered subsystem simulation. */
  getSubsystem(subsystem: Subsystem): SubsystemSimulation | undefined {
    return this.subsystems.get(subsystem);
  }

  /** Get all subsystem states (for save, UI snapshot). */
  getAllStates(): Map<Subsystem, SubsystemState> {
    const states = new Map<Subsystem, SubsystemState>();
    for (const [key, sim] of this.subsystems) {
      states.set(key, sim.getState());
    }
    return states;
  }

  /** Reset all subsystems. */
  resetAll(): void {
    for (const sim of this.subsystems.values()) {
      sim.reset();
    }
  }

  /** Master tick — updates all subsystems in dependency order. */
  private tick(dt: number, missionTime: MissionTime): void {
    // 1. Apply cross-system influences
    for (const dep of this.dependencies) {
      const source = this.subsystems.get(dep.from);
      const target = this.subsystems.get(dep.to);
      if (source && target) {
        dep.apply(source, target);
      }
    }

    // 2. Tick each subsystem in dependency order
    for (const subsystem of this.tickOrder) {
      const sim = this.subsystems.get(subsystem);
      if (sim) {
        sim.tick(dt, missionTime);

        // 3. Check for status changes and emit events
        const state = sim.getState();
        const prevStatus = this.previousStatuses.get(subsystem);
        if (prevStatus !== undefined && state.status !== prevStatus) {
          this.eventBus.emit('subsystem:statusChanged', {
            subsystem,
            from: prevStatus,
            to: state.status,
          });
          this.previousStatuses.set(subsystem, state.status);
        }
      }
    }
  }

  /**
   * Build tick order via topological sort of dependency graph.
   * Systems with no dependencies tick first.
   */
  private rebuildTickOrder(): void {
    const allSystems = new Set(this.subsystems.keys());
    const inDegree = new Map<Subsystem, number>();
    const adjacency = new Map<Subsystem, Subsystem[]>();

    for (const sys of allSystems) {
      inDegree.set(sys, 0);
      adjacency.set(sys, []);
    }

    for (const dep of this.dependencies) {
      if (allSystems.has(dep.from) && allSystems.has(dep.to)) {
        adjacency.get(dep.from)!.push(dep.to);
        inDegree.set(dep.to, (inDegree.get(dep.to) ?? 0) + 1);
      }
    }

    // Kahn's algorithm
    const queue: Subsystem[] = [];
    for (const [sys, deg] of inDegree) {
      if (deg === 0) queue.push(sys);
    }

    const order: Subsystem[] = [];
    while (queue.length > 0) {
      const sys = queue.shift()!;
      order.push(sys);
      for (const neighbor of adjacency.get(sys) ?? []) {
        const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
        inDegree.set(neighbor, newDeg);
        if (newDeg === 0) queue.push(neighbor);
      }
    }

    // If cycle detected, fall back to registration order
    if (order.length !== allSystems.size) {
      console.warn('Dependency cycle detected, using registration order');
      this.tickOrder = Array.from(allSystems);
    } else {
      this.tickOrder = order;
    }
  }
}
