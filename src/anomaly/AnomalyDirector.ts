/**
 * Anomaly Director — spawns, escalates, and manages active anomalies.
 *
 * The tension engine. Controls pacing, compound anomalies,
 * difficulty-aware injection, and conflict prevention.
 */

import { EventBus } from '../core/EventBus.js';
import { SimulationManager } from '../core/SimulationManager.js';
import { EntityId, MissionPhase, MissionTime, Subsystem, Fraction } from '../types/common.js';
import { AnomalyDefinition, AnomalyRuntimeState, AnomalySymptom, CascadeTarget } from '../types/anomaly.js';
import { AnomalyDatabase } from './AnomalyDatabase.js';

export interface AnomalyDirectorConfig {
  anomalyFrequency: Fraction;     // 0-1, how often anomalies spawn
  anomalyAmbiguity: Fraction;     // 0-1, how hard to diagnose
  cascadeSpeed: Fraction;         // 0-1, how fast cascades happen
  maxConcurrentAnomalies: number;
  minTimeBetweenAnomalies: number; // seconds
}

const DEFAULT_CONFIG: AnomalyDirectorConfig = {
  anomalyFrequency: 0.3,
  anomalyAmbiguity: 0.3,
  cascadeSpeed: 0.3,
  maxConcurrentAnomalies: 3,
  minTimeBetweenAnomalies: 120,
};

export class AnomalyDirector {
  private eventBus: EventBus;
  private database: AnomalyDatabase;
  private simulation: SimulationManager;
  private config: AnomalyDirectorConfig;

  private activeAnomalies = new Map<EntityId, AnomalyRuntimeState>();
  private lastSpawnTime = -Infinity;
  private currentPhase: MissionPhase = MissionPhase.Prelaunch;
  private availablePool: EntityId[] = [];
  private spawnAccumulator = 0;

  constructor(
    eventBus: EventBus,
    database: AnomalyDatabase,
    simulation: SimulationManager,
    config?: Partial<AnomalyDirectorConfig>,
  ) {
    this.eventBus = eventBus;
    this.database = database;
    this.simulation = simulation;
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.eventBus.on('phase:changed', (p) => {
      this.currentPhase = p.to;
    });

    this.eventBus.on('time:tick', (p) => {
      this.tick(p.dt, p.missionTime);
    });
  }

  /** Set the anomaly pool for current mission. */
  setPool(anomalyIds: EntityId[]): void {
    this.availablePool = [...anomalyIds];
  }

  /** Force-spawn a specific anomaly (for scripted events). */
  spawnAnomaly(anomalyId: EntityId, missionTime: MissionTime): AnomalyRuntimeState | null {
    const def = this.database.get(anomalyId);
    if (!def) return null;

    if (this.activeAnomalies.has(anomalyId)) return null; // already active

    const state: AnomalyRuntimeState = {
      definitionId: anomalyId,
      spawnTime: missionTime,
      currentLevel: 0,
      detected: false,
      resolved: false,
      activeSymptoms: [],
      cascadesTriggered: [],
    };

    // Apply initial symptoms
    this.applySymptoms(def, state, 0);
    this.activeAnomalies.set(anomalyId, state);

    this.eventBus.emit('anomaly:spawned', {
      anomalyId,
      hidden: def.visibleSymptoms.every(s => s.delaySeconds > 0),
    });

    this.lastSpawnTime = missionTime;
    return state;
  }

  /** Resolve an anomaly. */
  resolveAnomaly(anomalyId: EntityId, missionTime: MissionTime): void {
    const state = this.activeAnomalies.get(anomalyId);
    if (!state) return;

    state.resolved = true;
    state.resolvedTime = missionTime;

    // Clear associated faults from subsystems
    const def = this.database.get(anomalyId);
    if (def) {
      for (const subsystem of def.affectedSubsystems) {
        const sim = this.simulation.getSubsystem(subsystem);
        sim?.clearFault(`anomaly_${anomalyId}`);
      }
    }

    this.activeAnomalies.delete(anomalyId);
    this.eventBus.emit('anomaly:resolved', { anomalyId });
  }

  /** Get all active anomaly states. */
  getActive(): AnomalyRuntimeState[] {
    return Array.from(this.activeAnomalies.values());
  }

  getState(anomalyId: EntityId): AnomalyRuntimeState | undefined {
    return this.activeAnomalies.get(anomalyId);
  }

  private tick(dt: number, missionTime: MissionTime): void {
    // 1. Check for random anomaly spawning
    this.spawnAccumulator += dt;
    if (this.shouldSpawnRandom(missionTime)) {
      this.tryRandomSpawn(missionTime);
    }

    // 2. Escalate active anomalies
    for (const [id, state] of this.activeAnomalies) {
      if (state.resolved) continue;

      const def = this.database.get(id);
      if (!def) continue;

      const elapsed = missionTime - state.spawnTime;

      // Check escalation path
      for (const step of def.escalationPath) {
        const escalationDelay = step.delaySeconds / (1 + this.config.cascadeSpeed);
        if (step.level > state.currentLevel && elapsed >= escalationDelay) {
          this.escalate(id, state, def, step.level, missionTime);
        }
      }

      // Apply delayed symptoms
      for (const symptom of def.visibleSymptoms) {
        if (elapsed >= symptom.delaySeconds && !state.activeSymptoms.includes(symptom)) {
          state.activeSymptoms.push(symptom);
          this.applySymptomEffect(symptom);
        }
      }
    }
  }

  private shouldSpawnRandom(missionTime: MissionTime): boolean {
    if (this.activeAnomalies.size >= this.config.maxConcurrentAnomalies) return false;
    if (missionTime - this.lastSpawnTime < this.config.minTimeBetweenAnomalies) return false;

    // Probability check based on frequency config and accumulator
    const threshold = 60 / (this.config.anomalyFrequency + 0.01); // seconds between spawns
    if (this.spawnAccumulator >= threshold) {
      this.spawnAccumulator = 0;
      return true;
    }
    return false;
  }

  private tryRandomSpawn(missionTime: MissionTime): void {
    // Get eligible anomalies for current phase that aren't active
    const eligible = this.availablePool
      .filter(id => !this.activeAnomalies.has(id))
      .map(id => this.database.get(id))
      .filter((d): d is AnomalyDefinition => d !== undefined)
      .filter(d => d.allowedPhases.includes(this.currentPhase));

    if (eligible.length === 0) return;

    // Weighted random selection by difficulty
    const totalWeight = eligible.reduce((s, a) => s + a.difficultyWeight, 0);
    let roll = Math.random() * totalWeight;
    for (const anomaly of eligible) {
      roll -= anomaly.difficultyWeight;
      if (roll <= 0) {
        this.spawnAnomaly(anomaly.id, missionTime);
        return;
      }
    }
  }

  private escalate(
    anomalyId: EntityId,
    state: AnomalyRuntimeState,
    def: AnomalyDefinition,
    newLevel: number,
    missionTime: MissionTime,
  ): void {
    state.currentLevel = newLevel;

    const step = def.escalationPath.find(s => s.level === newLevel);
    if (!step) return;

    // Apply new symptoms from this escalation level
    if (step.newSymptoms) {
      for (const symptom of step.newSymptoms) {
        state.activeSymptoms.push(symptom);
        this.applySymptomEffect(symptom);
      }
    }

    this.eventBus.emit('anomaly:escalated', { anomalyId, level: newLevel });

    // Trigger cascades
    if (step.cascadeTargets) {
      for (const cascade of step.cascadeTargets) {
        this.applyCascade(anomalyId, cascade, missionTime);
      }
    }
  }

  private applySymptoms(def: AnomalyDefinition, state: AnomalyRuntimeState, level: number): void {
    // Apply immediate symptoms (delay = 0)
    for (const symptom of def.visibleSymptoms) {
      if (symptom.delaySeconds === 0) {
        state.activeSymptoms.push(symptom);
        this.applySymptomEffect(symptom);
      }
    }
  }

  private applySymptomEffect(symptom: AnomalySymptom): void {
    const sim = this.simulation.getSubsystem(symptom.subsystem);
    if (!sim) return;

    const current = sim.getParameter(symptom.parameter) ?? 0;
    switch (symptom.effect) {
      case 'offset':
        sim.setParameter(symptom.parameter, current + symptom.magnitude);
        break;
      case 'drift':
        // Drift is applied per-tick via faults — inject a fault
        sim.injectFault({
          id: `symptom_drift_${symptom.subsystem}_${symptom.parameter}`,
          hidden: symptom.confidenceToDetect > 0.5,
          severity: Math.abs(symptom.magnitude),
          affectedParameters: [symptom.parameter],
          escalationRate: symptom.magnitude * 0.01,
          timeActive: 0,
        });
        break;
      case 'spike':
        sim.setParameter(symptom.parameter, current + symptom.magnitude * 3);
        break;
      case 'noise':
        // Add randomness via fault
        sim.injectFault({
          id: `symptom_noise_${symptom.subsystem}_${symptom.parameter}`,
          hidden: false,
          severity: Math.abs(symptom.magnitude) * 0.3,
          affectedParameters: [symptom.parameter],
          escalationRate: 0,
          timeActive: 0,
        });
        break;
      case 'flatline':
        sim.setParameter(symptom.parameter, 0);
        break;
      case 'oscillation':
        // Oscillation handled via fault with alternating sign
        sim.injectFault({
          id: `symptom_osc_${symptom.subsystem}_${symptom.parameter}`,
          hidden: false,
          severity: Math.abs(symptom.magnitude),
          affectedParameters: [symptom.parameter],
          escalationRate: symptom.magnitude * 0.1,
          timeActive: 0,
        });
        break;
    }
  }

  private applyCascade(sourceAnomalyId: EntityId, cascade: CascadeTarget, missionTime: MissionTime): void {
    const sim = this.simulation.getSubsystem(cascade.subsystem);
    if (!sim) return;

    sim.injectFault({
      id: `cascade_${sourceAnomalyId}_${cascade.subsystem}`,
      hidden: true,
      severity: cascade.magnitude,
      affectedParameters: [cascade.effect],
      escalationRate: cascade.magnitude * 0.02,
      timeActive: 0,
    });

    const state = this.activeAnomalies.get(sourceAnomalyId);
    if (state) {
      state.cascadesTriggered.push(`${cascade.subsystem}_${cascade.effect}`);
    }

    this.eventBus.emit('anomaly:cascaded', {
      sourceId: sourceAnomalyId,
      targetSubsystem: cascade.subsystem,
    });
  }
}
