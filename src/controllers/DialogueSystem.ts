/**
 * Controller Dialogue System — callouts, confirmations, warnings,
 * disagreements, escalations, and post-decision reactions.
 *
 * Makes the room sound alive.
 */

import { EventBus } from '../core/EventBus.js';
import { EntityId, MissionPhase, Severity, Subsystem } from '../types/common.js';
import { ControllerFramework, ControllerState } from './ControllerFramework.js';

export type DialogueType = 'callout' | 'confirmation' | 'warning' | 'disagreement' | 'escalation' | 'reaction' | 'debrief';

export interface DialogueLine {
  id: EntityId;
  controllerId: EntityId;
  callsign: string;
  text: string;
  type: DialogueType;
  priority: number;            // higher = more urgent, plays first
  timestamp: number;
  duration?: number;           // estimated seconds to speak
  interruptible: boolean;
}

export interface DialogueTemplate {
  id: string;
  type: DialogueType;
  subsystem?: Subsystem;
  phase?: MissionPhase;
  triggerCondition: string;
  templates: Array<{
    text: string;
    trustMin?: number;
    trustMax?: number;
    frustrationMin?: number;
  }>;
  priority: number;
  cooldownSeconds: number;
}

export class DialogueSystem {
  private eventBus: EventBus;
  private controllers: ControllerFramework;
  private queue: DialogueLine[] = [];
  private history: DialogueLine[] = [];
  private templates: DialogueTemplate[] = [];
  private templateCooldowns = new Map<string, number>();
  private missionTime = 0;

  constructor(eventBus: EventBus, controllers: ControllerFramework) {
    this.eventBus = eventBus;
    this.controllers = controllers;

    this.eventBus.on('time:tick', (p) => {
      this.missionTime = p.missionTime;
    });

    // Auto-generate dialogue from various events
    this.eventBus.on('phase:changed', (p) => {
      this.onPhaseChange(p.from, p.to);
    });

    this.eventBus.on('poll:vote', (p) => {
      this.enqueueLine({
        controllerId: p.controllerId,
        text: p.reason ?? `${p.vote.toUpperCase()}`,
        type: p.vote === 'no_go' ? 'warning' : 'callout',
        priority: p.vote === 'no_go' ? 8 : 5,
        interruptible: false,
      });
    });

    this.eventBus.on('command:executed', (p) => {
      // Controllers react to commands
      if (p.success) {
        this.generateReaction('command_success');
      }
    });

    this.registerBuiltinTemplates();
  }

  /** Register dialogue templates. */
  registerTemplate(template: DialogueTemplate): void {
    this.templates.push(template);
  }

  /** Manually enqueue a dialogue line. */
  enqueueLine(params: {
    controllerId: EntityId;
    text: string;
    type: DialogueType;
    priority: number;
    interruptible?: boolean;
  }): DialogueLine {
    const ctrl = this.controllers.getController(params.controllerId);
    const line: DialogueLine = {
      id: `dlg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      controllerId: params.controllerId,
      callsign: ctrl?.callsign ?? 'UNKNOWN',
      text: params.text,
      type: params.type,
      priority: params.priority,
      timestamp: this.missionTime,
      interruptible: params.interruptible ?? true,
    };

    this.queue.push(line);
    this.queue.sort((a, b) => b.priority - a.priority);

    this.eventBus.emit('controller:dialogue', {
      controllerId: params.controllerId,
      text: params.text,
      type: params.type as any,
    });

    return line;
  }

  /** Get next line to play from queue. */
  dequeue(): DialogueLine | null {
    const line = this.queue.shift() ?? null;
    if (line) this.history.push(line);
    return line;
  }

  /** Peek at the queue without removing. */
  peekQueue(limit = 10): DialogueLine[] {
    return this.queue.slice(0, limit);
  }

  /** Get dialogue history (for transcript panel). */
  getHistory(limit = 50): DialogueLine[] {
    return this.history.slice(-limit);
  }

  /** Generate a reaction from a random controller based on an event. */
  generateReaction(triggerCondition: string): void {
    const templates = this.templates.filter(t => t.triggerCondition === triggerCondition);
    if (templates.length === 0) return;

    const template = templates[Math.floor(Math.random() * templates.length)];

    // Cooldown check
    const lastUsed = this.templateCooldowns.get(template.id);
    if (lastUsed !== undefined && this.missionTime - lastUsed < template.cooldownSeconds) return;

    // Find the right controller
    let ctrl: ControllerState | undefined;
    if (template.subsystem) {
      ctrl = this.controllers.getBySubsystem(template.subsystem);
    } else {
      const all = this.controllers.getAll();
      ctrl = all[Math.floor(Math.random() * all.length)];
    }
    if (!ctrl) return;

    // Pick text variant based on trust/frustration state
    const eligible = template.templates.filter(t => {
      if (t.trustMin !== undefined && ctrl!.trustInPlayer < t.trustMin) return false;
      if (t.trustMax !== undefined && ctrl!.trustInPlayer > t.trustMax) return false;
      if (t.frustrationMin !== undefined && ctrl!.frustration < t.frustrationMin) return false;
      return true;
    });

    const variant = eligible.length > 0
      ? eligible[Math.floor(Math.random() * eligible.length)]
      : template.templates[0];

    if (variant) {
      this.enqueueLine({
        controllerId: ctrl.id,
        text: `${ctrl.callsign}: ${variant.text}`,
        type: template.type,
        priority: template.priority,
      });
      this.templateCooldowns.set(template.id, this.missionTime);
    }
  }

  private onPhaseChange(from: MissionPhase, to: MissionPhase): void {
    // All controllers call out their status on phase change
    for (const ctrl of this.controllers.getAll()) {
      const vote = this.controllers.getVote(ctrl.id);
      this.enqueueLine({
        controllerId: ctrl.id,
        text: `${ctrl.callsign} is ${vote.vote.toUpperCase()}.`,
        type: 'callout',
        priority: 5,
        interruptible: false,
      });
    }
  }

  private registerBuiltinTemplates(): void {
    this.registerTemplate({
      id: 'tpl_go_reaction',
      type: 'reaction',
      triggerCondition: 'command_success',
      templates: [
        { text: 'Copy that, Flight.' },
        { text: 'Roger, executing.' },
        { text: 'Understood.' },
        { text: 'Copy, Flight. On it.', trustMin: 0.6 },
        { text: "...alright, if you say so.", trustMax: 0.3, frustrationMin: 0.3 },
      ],
      priority: 3,
      cooldownSeconds: 30,
    });

    this.registerTemplate({
      id: 'tpl_anomaly_detected',
      type: 'callout',
      triggerCondition: 'anomaly_detected',
      templates: [
        { text: "I'm seeing something here. Stand by." },
        { text: "Flight, we've got an off-nominal reading." },
        { text: 'Something just changed. Looking at it now.' },
        { text: 'Hey Flight? Not sure I like what I see here.', trustMin: 0.5 },
      ],
      priority: 7,
      cooldownSeconds: 20,
    });

    this.registerTemplate({
      id: 'tpl_good_news',
      type: 'confirmation',
      triggerCondition: 'anomaly_resolved',
      templates: [
        { text: 'Looking good now. Back to nominal.' },
        { text: 'That did it. Values are recovering.' },
        { text: 'Nice call, Flight. System is stabilizing.', trustMin: 0.6 },
      ],
      priority: 4,
      cooldownSeconds: 15,
    });

    this.registerTemplate({
      id: 'tpl_frustration',
      type: 'disagreement',
      triggerCondition: 'recommendation_ignored',
      templates: [
        { text: "Flight, I'd really like you to look at this.", frustrationMin: 0.3 },
        { text: "I've flagged this multiple times now.", frustrationMin: 0.5 },
        { text: "With respect, Flight, I think you're making a mistake.", frustrationMin: 0.7 },
      ],
      priority: 6,
      cooldownSeconds: 60,
    });
  }
}
