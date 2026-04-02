/**
 * Anomaly Database — stores and retrieves anomaly definitions.
 */

import { EntityId, MissionPhase, Subsystem } from '../types/common.js';
import { AnomalyDefinition } from '../types/anomaly.js';

export class AnomalyDatabase {
  private anomalies = new Map<EntityId, AnomalyDefinition>();

  register(anomaly: AnomalyDefinition): void {
    this.anomalies.set(anomaly.id, anomaly);
  }

  registerAll(anomalies: AnomalyDefinition[]): void {
    for (const a of anomalies) this.register(a);
  }

  get(id: EntityId): AnomalyDefinition | undefined {
    return this.anomalies.get(id);
  }

  /** Get all anomalies that can affect a given subsystem. */
  getBySubsystem(subsystem: Subsystem): AnomalyDefinition[] {
    return Array.from(this.anomalies.values())
      .filter(a => a.affectedSubsystems.includes(subsystem));
  }

  /** Get anomalies valid for a given mission phase. */
  getByPhase(phase: MissionPhase): AnomalyDefinition[] {
    return Array.from(this.anomalies.values())
      .filter(a => a.allowedPhases.includes(phase));
  }

  /** Get anomalies from a pool of IDs. */
  getPool(ids: EntityId[]): AnomalyDefinition[] {
    return ids.map(id => this.anomalies.get(id)).filter((a): a is AnomalyDefinition => a !== undefined);
  }

  /** Get all anomalies within a difficulty range. */
  getByDifficulty(minWeight: number, maxWeight: number): AnomalyDefinition[] {
    return Array.from(this.anomalies.values())
      .filter(a => a.difficultyWeight >= minWeight && a.difficultyWeight <= maxWeight);
  }

  getAll(): AnomalyDefinition[] {
    return Array.from(this.anomalies.values());
  }
}
