/**
 * Crew Task System — receive instructions, execute checklists,
 * manual inspections, physical interactions. With real delay and failure chance.
 */

import { EventBus } from '../core/EventBus.js';
import { CrewSim, CrewMember } from '../simulation/CrewSim.js';
import { EntityId, MissionTime } from '../types/common.js';

export interface CrewTask {
  id: EntityId;
  assigneeId: EntityId;
  type: 'checklist' | 'inspection' | 'manual_override' | 'repair' | 'report';
  description: string;
  estimatedDurationSec: number;
  startedAt?: MissionTime;
  completedAt?: MissionTime;
  status: 'queued' | 'in_progress' | 'completed' | 'failed';
  result?: string;
}

export class CrewTaskSystem {
  private eventBus: EventBus;
  private crewSim: CrewSim;
  private tasks = new Map<EntityId, CrewTask>();
  private missionTime = 0;

  constructor(eventBus: EventBus, crewSim: CrewSim) {
    this.eventBus = eventBus;
    this.crewSim = crewSim;

    this.eventBus.on('time:tick', (p) => {
      this.missionTime = p.missionTime;
      this.processTasks(p.dt);
    });
  }

  /** Assign a task to a crew member. */
  assignTask(params: {
    assigneeId: EntityId;
    type: CrewTask['type'];
    description: string;
    estimatedDurationSec: number;
  }): EntityId {
    const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const task: CrewTask = {
      id,
      ...params,
      status: 'queued',
    };

    this.tasks.set(id, task);
    this.eventBus.emit('crew:taskAssigned', { crewId: params.assigneeId, taskId: id });
    return id;
  }

  /** Get tasks for a specific crew member. */
  getTasksForCrew(crewId: EntityId): CrewTask[] {
    return Array.from(this.tasks.values()).filter(t => t.assigneeId === crewId);
  }

  /** Get all active tasks. */
  getActive(): CrewTask[] {
    return Array.from(this.tasks.values()).filter(t => t.status === 'queued' || t.status === 'in_progress');
  }

  /** Get all completed tasks. */
  getCompleted(): CrewTask[] {
    return Array.from(this.tasks.values()).filter(t => t.status === 'completed' || t.status === 'failed');
  }

  private processTasks(dt: number): void {
    for (const task of this.tasks.values()) {
      if (task.status === 'queued') {
        // Check if crew member is available
        const member = this.crewSim.getMember(task.assigneeId);
        if (!member || member.resting || member.health === 'incapacitated') continue;

        // Check if crew member has capacity (not already doing something)
        const activeTasks = this.getTasksForCrew(task.assigneeId).filter(t => t.status === 'in_progress');
        if (activeTasks.length >= 2) continue; // max 2 concurrent tasks

        task.status = 'in_progress';
        task.startedAt = this.missionTime;
      }

      if (task.status === 'in_progress' && task.startedAt !== undefined) {
        const member = this.crewSim.getMember(task.assigneeId);
        if (!member) continue;

        // Actual duration modified by crew performance
        const actualDuration = task.estimatedDurationSec * member.responseDelay;
        const elapsed = this.missionTime - task.startedAt;

        if (elapsed >= actualDuration) {
          // Task completion — success/failure based on crew state
          const success = Math.random() < member.taskSuccessProbability;

          task.status = success ? 'completed' : 'failed';
          task.completedAt = this.missionTime;
          task.result = success ? 'Task completed successfully' : 'Task failed — crew error under strain';

          this.eventBus.emit('crew:taskCompleted', {
            crewId: task.assigneeId,
            taskId: task.id,
            success,
          });

          // Failed tasks increase stress
          if (!success) {
            this.crewSim.applyStressEvent(0.05);
          }
        }
      }
    }
  }
}
