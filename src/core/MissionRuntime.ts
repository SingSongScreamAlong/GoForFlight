/**
 * Mission Runtime Manager — loads, runs, and evaluates missions.
 *
 * This is the orchestrator that connects the mission definition
 * to all active subsystems during gameplay.
 */

import { EventBus } from './EventBus.js';
import { TimeController } from './TimeController.js';
import {
  EntityId,
  MissionPhase,
  MissionTime,
  ObjectiveStatus,
  Subsystem,
  Status,
} from '../types/common.js';
import {
  ConditionDefinition,
  DecisionLogEntry,
  MissionDefinition,
  MissionRuntimeState,
} from '../types/mission.js';

export class MissionRuntime {
  private eventBus: EventBus;
  private time: TimeController;
  private definition: MissionDefinition | null = null;
  private state: MissionRuntimeState | null = null;

  // Subsystem status cache (populated by subsystem simulations emitting events)
  private subsystemStatuses = new Map<Subsystem, Status>();

  constructor(eventBus: EventBus, time: TimeController) {
    this.eventBus = eventBus;
    this.time = time;

    // Listen for subsystem status changes
    this.eventBus.on('subsystem:statusChanged', (payload) => {
      this.subsystemStatuses.set(payload.subsystem, payload.to);
    });

    // Listen for ticks to check phase advancement and objectives
    this.eventBus.on('time:tick', (payload) => {
      this.onTick(payload.dt, payload.missionTime);
    });
  }

  /** Load a mission definition and prepare runtime state. */
  loadMission(definition: MissionDefinition): void {
    this.definition = definition;
    this.state = {
      missionId: definition.id,
      currentPhase: definition.phases[0]?.phase ?? MissionPhase.Prelaunch,
      phaseIndex: 0,
      missionTimeElapsed: 0,
      objectives: new Map(
        definition.objectives.map(o => [o.id, o.initialStatus])
      ),
      activeAnomalies: [],
      resolvedAnomalies: [],
      activeAlerts: [],
      activeProcedures: [],
      decisionLog: [],
      branchState: new Map(),
    };

    // Initialize subsystem statuses
    for (const subsystem of Object.values(Subsystem)) {
      this.subsystemStatuses.set(subsystem, Status.Nominal);
    }

    this.eventBus.emit('mission:loaded', { missionId: definition.id });
  }

  /** Start the loaded mission. */
  startMission(): void {
    if (!this.definition || !this.state) {
      throw new Error('No mission loaded');
    }

    // Activate initial objectives
    for (const obj of this.definition.objectives) {
      if (obj.initialStatus === ObjectiveStatus.Active) {
        this.state.objectives.set(obj.id, ObjectiveStatus.Active);
      }
    }

    this.time.setMET(0);
    this.eventBus.emit('mission:started', { missionId: this.definition.id });

    // Emit initial phase
    this.eventBus.emit('phase:changed', {
      from: MissionPhase.Prelaunch,
      to: this.state.currentPhase,
      missionTime: 0,
    });
  }

  /** Advance to the next mission phase. */
  advancePhase(): void {
    if (!this.definition || !this.state) return;

    const phases = this.definition.phases;
    if (this.state.phaseIndex >= phases.length - 1) return;

    const from = this.state.currentPhase;
    this.state.phaseIndex++;
    this.state.currentPhase = phases[this.state.phaseIndex].phase;

    this.eventBus.emit('phase:changed', {
      from,
      to: this.state.currentPhase,
      missionTime: this.time.getMET(),
    });
  }

  /** Force a specific phase (for aborts, skips). */
  setPhase(phase: MissionPhase): void {
    if (!this.state) return;
    const from = this.state.currentPhase;
    this.state.currentPhase = phase;

    // Find matching phase index
    const idx = this.definition?.phases.findIndex(p => p.phase === phase) ?? -1;
    if (idx !== -1) this.state.phaseIndex = idx;

    this.eventBus.emit('phase:changed', {
      from,
      to: phase,
      missionTime: this.time.getMET(),
    });
  }

  /** Update an objective's status. */
  updateObjective(objectiveId: EntityId, newStatus: ObjectiveStatus): void {
    if (!this.state) return;
    const oldStatus = this.state.objectives.get(objectiveId);
    if (oldStatus === undefined || oldStatus === newStatus) return;

    this.state.objectives.set(objectiveId, newStatus);
    this.eventBus.emit('objective:statusChanged', {
      objectiveId,
      from: oldStatus,
      to: newStatus,
    });
  }

  /** Record a player decision. */
  recordDecision(decision: Omit<DecisionLogEntry, 'missionTime'>): void {
    if (!this.state) return;
    const entry: DecisionLogEntry = {
      ...decision,
      missionTime: this.time.getMET(),
    };
    this.state.decisionLog.push(entry);
    this.eventBus.emit('decision:made', {
      decisionId: decision.id,
      choice: decision.choice,
      missionTime: entry.missionTime,
    });
  }

  /** Set a branch state variable (for tracking alternate paths). */
  setBranch(key: string, value: string): void {
    this.state?.branchState.set(key, value);
  }

  getBranch(key: string): string | undefined {
    return this.state?.branchState.get(key);
  }

  /** Abort the mission. */
  abortMission(reason: string): void {
    if (!this.definition || !this.state) return;
    this.state.currentPhase = MissionPhase.Aborted;
    this.time.pause();
    this.eventBus.emit('mission:aborted', {
      missionId: this.definition.id,
      reason,
    });
  }

  /** Complete the mission. */
  completeMission(): void {
    if (!this.definition || !this.state) return;
    const success = this.evaluateSuccess();
    this.state.currentPhase = MissionPhase.Complete;
    this.time.pause();
    this.eventBus.emit('mission:completed', {
      missionId: this.definition.id,
      success,
    });
  }

  /** Serialize runtime state for saving. */
  serialize(): string {
    if (!this.state) return '{}';
    return JSON.stringify({
      ...this.state,
      objectives: Array.from(this.state.objectives.entries()),
      branchState: Array.from(this.state.branchState.entries()),
    });
  }

  /** Restore runtime state from a save. */
  deserialize(json: string): void {
    const raw = JSON.parse(json);
    this.state = {
      ...raw,
      objectives: new Map(raw.objectives),
      branchState: new Map(raw.branchState),
    };
    this.time.setMET(this.state!.missionTimeElapsed);
  }

  // ── Accessors ──────────────────────────────────────────────────

  getDefinition(): MissionDefinition | null { return this.definition; }
  getState(): MissionRuntimeState | null { return this.state; }
  getCurrentPhase(): MissionPhase | null { return this.state?.currentPhase ?? null; }
  getMissionId(): EntityId | null { return this.definition?.id ?? null; }

  // ── Internal ───────────────────────────────────────────────────

  private onTick(_dt: number, missionTime: MissionTime): void {
    if (!this.definition || !this.state) return;

    this.state.missionTimeElapsed = missionTime;

    // Check phase auto-advance
    const currentPhaseDef = this.definition.phases[this.state.phaseIndex];
    if (currentPhaseDef?.autoAdvance) {
      const phaseStart = this.getPhaseStartTime(this.state.phaseIndex);
      if (missionTime - phaseStart >= currentPhaseDef.durationSeconds) {
        this.advancePhase();
      }
    }

    // Check scripted events
    for (const event of this.definition.scriptedEvents) {
      if (event.triggerTime !== undefined && Math.abs(missionTime - event.triggerTime) < 0.1) {
        this.fireScriptedEvent(event.id, event.eventType, event.payload);
      }
      if (event.triggerPhase && event.triggerPhase === this.state.currentPhase) {
        this.fireScriptedEvent(event.id, event.eventType, event.payload);
      }
    }

    // Check completion conditions
    this.checkMissionEndConditions();
  }

  private getPhaseStartTime(phaseIndex: number): number {
    let t = 0;
    for (let i = 0; i < phaseIndex; i++) {
      t += this.definition!.phases[i].durationSeconds;
    }
    return t;
  }

  private firedEvents = new Set<EntityId>();

  private fireScriptedEvent(id: EntityId, type: string, payload: Record<string, unknown>): void {
    if (this.firedEvents.has(id)) return;
    this.firedEvents.add(id);
    // Scripted events are dispatched through the event bus based on type
    // Specific handlers will pick them up
  }

  private evaluateSuccess(): boolean {
    if (!this.definition || !this.state) return false;
    // Success = all primary objectives completed
    return this.definition.objectives
      .filter(o => o.type === 'primary')
      .every(o => this.state!.objectives.get(o.id) === ObjectiveStatus.Completed);
  }

  private checkMissionEndConditions(): void {
    if (!this.definition || !this.state) return;

    // Check failure conditions
    for (const condition of this.definition.failureConditions) {
      if (this.evaluateCondition(condition)) {
        this.abortMission('Failure condition met');
        return;
      }
    }

    // Check success conditions
    const allSuccess = this.definition.successConditions.every(c => this.evaluateCondition(c));
    if (allSuccess && this.definition.successConditions.length > 0) {
      this.completeMission();
    }
  }

  /** Evaluate a condition definition against current state. */
  evaluateCondition(condition: ConditionDefinition): boolean {
    switch (condition.type) {
      case 'phase':
        return this.state?.currentPhase === condition.params['phase'];

      case 'time':
        return this.time.getMET() >= (condition.params['minTime'] as number ?? 0)
          && this.time.getMET() <= (condition.params['maxTime'] as number ?? Infinity);

      case 'objective_status':
        return this.state?.objectives.get(condition.params['objectiveId'] as string)
          === condition.params['status'];

      case 'subsystem_status':
        return this.subsystemStatuses.get(condition.params['subsystem'] as Subsystem)
          === condition.params['status'];

      case 'compound_and': {
        const andConditions = condition.params['conditions'] as ConditionDefinition[];
        return andConditions?.every(c => this.evaluateCondition(c)) ?? false;
      }

      case 'compound_or': {
        const orConditions = condition.params['conditions'] as ConditionDefinition[];
        return orConditions?.some(c => this.evaluateCondition(c)) ?? false;
      }

      default:
        return false;
    }
  }
}
