/**
 * Command System — how the player acts on the world.
 *
 * Handles command validation, execution timing, success/failure,
 * cooldowns, and the full taxonomy of mission/system/crew/strategy commands.
 */

import { EventBus } from '../core/EventBus.js';
import { SimulationManager } from '../core/SimulationManager.js';
import { EntityId, MissionTime, Subsystem } from '../types/common.js';

export type CommandCategory = 'authority' | 'system' | 'crew' | 'strategy';

export interface CommandDefinition {
  id: string;
  name: string;
  category: CommandCategory;
  description: string;
  target: Subsystem | 'mission';
  /** Minimum time before command takes effect (seconds). */
  latency: number;
  /** Cooldown before same command can be issued again (seconds). */
  cooldown: number;
  /** Validation function — returns true if command can execute. */
  validate?: (context: CommandContext) => boolean;
  /** Execution function — applies the command effects. */
  execute: (context: CommandContext) => CommandResult;
}

export interface CommandContext {
  simulation: SimulationManager;
  missionTime: MissionTime;
  parameters?: Record<string, unknown>;
}

export interface CommandResult {
  success: boolean;
  message: string;
  effects?: string[];
}

interface PendingCommand {
  id: EntityId;
  definition: CommandDefinition;
  context: CommandContext;
  issuedAt: MissionTime;
  executeAt: MissionTime;
}

export class CommandSystem {
  private eventBus: EventBus;
  private simulation: SimulationManager;
  private commands = new Map<string, CommandDefinition>();
  private pending: PendingCommand[] = [];
  private cooldowns = new Map<string, MissionTime>();
  private missionTime: MissionTime = 0;

  constructor(eventBus: EventBus, simulation: SimulationManager) {
    this.eventBus = eventBus;
    this.simulation = simulation;

    this.eventBus.on('time:tick', (p) => {
      this.missionTime = p.missionTime;
      this.processPending(p.missionTime);
    });

    this.registerBuiltinCommands();
  }

  /** Register a command definition. */
  registerCommand(def: CommandDefinition): void {
    this.commands.set(def.id, def);
  }

  /** Issue a command. Returns the command instance ID or null if invalid. */
  issueCommand(commandId: string, parameters?: Record<string, unknown>): EntityId | null {
    const def = this.commands.get(commandId);
    if (!def) {
      console.warn(`Unknown command: ${commandId}`);
      return null;
    }

    // Cooldown check
    const lastUsed = this.cooldowns.get(commandId);
    if (lastUsed !== undefined && this.missionTime - lastUsed < def.cooldown) {
      return null;
    }

    const context: CommandContext = {
      simulation: this.simulation,
      missionTime: this.missionTime,
      parameters,
    };

    // Validation
    if (def.validate && !def.validate(context)) {
      return null;
    }

    const instanceId = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    this.eventBus.emit('command:issued', {
      commandId: instanceId,
      type: def.id,
      target: def.target,
    });

    if (def.latency > 0) {
      // Queue for delayed execution
      this.pending.push({
        id: instanceId,
        definition: def,
        context,
        issuedAt: this.missionTime,
        executeAt: this.missionTime + def.latency,
      });
    } else {
      // Execute immediately
      this.executeCommand(instanceId, def, context);
    }

    this.cooldowns.set(commandId, this.missionTime);
    return instanceId;
  }

  /** Get all available commands for a given category/target. */
  getAvailableCommands(category?: CommandCategory, target?: Subsystem | 'mission'): CommandDefinition[] {
    let cmds = Array.from(this.commands.values());
    if (category) cmds = cmds.filter(c => c.category === category);
    if (target) cmds = cmds.filter(c => c.target === target);
    return cmds;
  }

  /** Check if a command is on cooldown. */
  isOnCooldown(commandId: string): boolean {
    const def = this.commands.get(commandId);
    if (!def) return false;
    const lastUsed = this.cooldowns.get(commandId);
    if (lastUsed === undefined) return false;
    return this.missionTime - lastUsed < def.cooldown;
  }

  private processPending(missionTime: MissionTime): void {
    const ready = this.pending.filter(p => missionTime >= p.executeAt);
    this.pending = this.pending.filter(p => missionTime < p.executeAt);

    for (const cmd of ready) {
      this.executeCommand(cmd.id, cmd.definition, cmd.context);
    }
  }

  private executeCommand(instanceId: EntityId, def: CommandDefinition, context: CommandContext): void {
    const result = def.execute(context);

    if (result.success) {
      this.eventBus.emit('command:executed', { commandId: instanceId, success: true });
    } else {
      this.eventBus.emit('command:failed', { commandId: instanceId, reason: result.message });
    }
  }

  // ── Built-in command definitions ────────────────────────────────

  private registerBuiltinCommands(): void {
    // Mission authority commands
    this.registerCommand({
      id: 'cmd_go', name: 'GO', category: 'authority', description: 'Declare GO for current phase',
      target: 'mission', latency: 0, cooldown: 5,
      execute: () => ({ success: true, message: 'Flight Director declares GO' }),
    });

    this.registerCommand({
      id: 'cmd_nogo', name: 'NO-GO', category: 'authority', description: 'Declare NO-GO, initiate hold',
      target: 'mission', latency: 0, cooldown: 5,
      execute: () => ({ success: true, message: 'Flight Director declares NO-GO' }),
    });

    this.registerCommand({
      id: 'cmd_hold', name: 'HOLD', category: 'authority', description: 'Hold current countdown/operations',
      target: 'mission', latency: 0, cooldown: 3,
      execute: () => ({ success: true, message: 'HOLD called' }),
    });

    this.registerCommand({
      id: 'cmd_abort', name: 'ABORT', category: 'authority', description: 'Abort the mission',
      target: 'mission', latency: 0, cooldown: 30,
      execute: () => ({ success: true, message: 'ABORT initiated', effects: ['mission_abort'] }),
    });

    this.registerCommand({
      id: 'cmd_scrub', name: 'SCRUB', category: 'authority', description: 'Scrub the launch',
      target: 'mission', latency: 0, cooldown: 60,
      execute: () => ({ success: true, message: 'Launch SCRUBBED' }),
    });

    // System commands
    this.registerCommand({
      id: 'cmd_isolate', name: 'Isolate Subsystem', category: 'system',
      description: 'Isolate a subsystem from others',
      target: 'mission', latency: 2, cooldown: 10,
      execute: (ctx) => {
        const sub = ctx.parameters?.['subsystem'] as Subsystem | undefined;
        if (!sub) return { success: false, message: 'No subsystem specified' };
        return { success: true, message: `${sub} isolated`, effects: [`isolate_${sub}`] };
      },
    });

    this.registerCommand({
      id: 'cmd_switch_backup', name: 'Switch to Backup', category: 'system',
      description: 'Switch subsystem to backup hardware',
      target: 'mission', latency: 5, cooldown: 30,
      execute: (ctx) => {
        const sub = ctx.parameters?.['subsystem'] as Subsystem | undefined;
        if (!sub) return { success: false, message: 'No subsystem specified' };
        return { success: true, message: `${sub} switched to backup`, effects: [`backup_${sub}`] };
      },
    });

    this.registerCommand({
      id: 'cmd_reroute_power', name: 'Reroute Power', category: 'system',
      description: 'Reroute power bus configuration',
      target: Subsystem.Power, latency: 3, cooldown: 15,
      execute: (ctx) => {
        const sim = ctx.simulation.getSubsystem(Subsystem.Power);
        if (sim) {
          sim.setParameter('totalLoadWatts', (sim.getParameter('totalLoadWatts') ?? 1200) * 0.8);
        }
        return { success: true, message: 'Power rerouted', effects: ['reduced_load'] };
      },
    });

    this.registerCommand({
      id: 'cmd_change_attitude', name: 'Change Attitude Profile', category: 'system',
      description: 'Command new spacecraft attitude',
      target: Subsystem.GNC, latency: 5, cooldown: 20,
      execute: () => ({ success: true, message: 'Attitude change commanded' }),
    });

    this.registerCommand({
      id: 'cmd_reboot_system', name: 'Reboot/Recalibrate', category: 'system',
      description: 'Reboot or recalibrate a subsystem',
      target: 'mission', latency: 15, cooldown: 60,
      execute: (ctx) => {
        const sub = ctx.parameters?.['subsystem'] as Subsystem | undefined;
        if (!sub) return { success: false, message: 'No subsystem specified' };
        const sim = ctx.simulation.getSubsystem(sub);
        if (sim) {
          // Clear all faults on reboot
          const state = sim.getState();
          for (const fault of state.faults) {
            sim.clearFault(fault.id);
          }
        }
        return { success: true, message: `${sub} rebooting`, effects: [`reboot_${sub}`] };
      },
    });

    // Crew commands
    this.registerCommand({
      id: 'cmd_capcom', name: 'Send CAPCOM Message', category: 'crew',
      description: 'Send a message to the crew via CAPCOM',
      target: Subsystem.Crew, latency: 2, cooldown: 5,
      execute: (ctx) => {
        const msg = ctx.parameters?.['message'] as string ?? 'Message sent';
        return { success: true, message: `CAPCOM: ${msg}` };
      },
    });

    this.registerCommand({
      id: 'cmd_visual_inspection', name: 'Request Visual Inspection', category: 'crew',
      description: 'Request crew perform visual inspection',
      target: Subsystem.Crew, latency: 10, cooldown: 30,
      execute: () => ({ success: true, message: 'Crew performing visual inspection' }),
    });

    this.registerCommand({
      id: 'cmd_order_rest', name: 'Order Rest', category: 'crew',
      description: 'Order a crew member to rest',
      target: Subsystem.Crew, latency: 0, cooldown: 10,
      execute: () => ({ success: true, message: 'Crew member ordered to rest' }),
    });

    this.registerCommand({
      id: 'cmd_suit_up', name: 'Order Suit-Up', category: 'crew',
      description: 'Order crew to don pressure suits',
      target: Subsystem.Crew, latency: 5, cooldown: 60,
      execute: () => ({ success: true, message: 'Crew suiting up' }),
    });

    // Strategy commands
    this.registerCommand({
      id: 'cmd_revise_burn', name: 'Revise Burn Timing', category: 'strategy',
      description: 'Adjust planned burn window',
      target: Subsystem.Propulsion, latency: 10, cooldown: 30,
      execute: () => ({ success: true, message: 'Burn timing revised' }),
    });

    this.registerCommand({
      id: 'cmd_conserve_margin', name: 'Conserve Margin', category: 'strategy',
      description: 'Enter margin conservation mode',
      target: 'mission', latency: 0, cooldown: 60,
      execute: () => ({ success: true, message: 'Entering conservation mode', effects: ['conserve_mode'] }),
    });

    this.registerCommand({
      id: 'cmd_accept_risk', name: 'Accept Risk Posture', category: 'strategy',
      description: 'Accept elevated risk to continue mission',
      target: 'mission', latency: 0, cooldown: 30,
      execute: () => ({ success: true, message: 'Risk posture accepted' }),
    });

    this.registerCommand({
      id: 'cmd_cut_objective', name: 'Cut Objective', category: 'strategy',
      description: 'Drop a non-essential mission objective',
      target: 'mission', latency: 0, cooldown: 10,
      execute: () => ({ success: true, message: 'Objective cut from mission plan' }),
    });
  }
}
