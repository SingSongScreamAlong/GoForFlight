/**
 * Active Mission Screen — wraps the existing Renderer with
 * full interactivity: clickable commands, alert acknowledgement,
 * procedure stepping, subsystem drill-down.
 *
 * This is where the player spends most of their time.
 */

import { Screen } from '../GameFlowController.js';
import { Renderer, RendererDependencies } from '../Renderer.js';
import { UIStateManager } from '../UIStateManager.js';
import { EventBus } from '../../core/EventBus.js';
import { TimeController } from '../../core/TimeController.js';
import { MissionRuntime } from '../../core/MissionRuntime.js';
import { CommandSystem } from '../../commands/CommandSystem.js';
import { AlertEngine } from '../../alerts/AlertEngine.js';
import { ProcedureRunner } from '../../procedures/ProcedureRunner.js';
import { GoNoGoPoll } from '../../commands/GoNoGoPoll.js';
import { ControllerFramework } from '../../controllers/ControllerFramework.js';
import { RoomAmbience } from '../../audio/RoomAmbience.js';
import { VoicePlayback } from '../../audio/VoicePlayback.js';
import { GameStateManager } from '../../core/GameStateManager.js';
import { GameState, MissionPhase, Subsystem } from '../../types/common.js';

export interface ActiveMissionDeps extends RendererDependencies {
  gameState: GameStateManager;
  poll: GoNoGoPoll;
  roomAmbience: RoomAmbience;
  voicePlayback: VoicePlayback;
}

export class ActiveMissionScreen implements Screen {
  private deps: ActiveMissionDeps;
  private renderer: Renderer | null = null;
  private root: HTMLElement | null = null;
  private clickHandler: ((e: MouseEvent) => void) | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(deps: ActiveMissionDeps) {
    this.deps = deps;
  }

  mount(root: HTMLElement): void {
    this.root = root;

    // Create the renderer (it builds the full mission control layout)
    this.renderer = new Renderer(root, this.deps);
    this.renderer.start();
    this.deps.roomAmbience.start();

    // Wire up global click delegation
    this.clickHandler = (e: MouseEvent) => this.handleClick(e);
    root.addEventListener('click', this.clickHandler);

    // Wire keyboard shortcuts
    this.keyHandler = (e: KeyboardEvent) => this.handleKey(e);
    document.addEventListener('keydown', this.keyHandler);
  }

  unmount(): void {
    this.renderer?.stop();
    this.renderer = null;
    this.deps.roomAmbience.stop();

    if (this.clickHandler && this.root) {
      this.root.removeEventListener('click', this.clickHandler);
    }
    if (this.keyHandler) {
      document.removeEventListener('keydown', this.keyHandler);
    }
    this.root = null;
  }

  private handleClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (!target) return;

    // ── Command buttons ───────────────────────────────────────
    const cmdBtn = target.closest('[data-cmd]') as HTMLElement;
    if (cmdBtn) {
      const cmdId = cmdBtn.getAttribute('data-cmd')!;
      this.executeCommand(cmdId);
      return;
    }

    // ── Alert acknowledgement ─────────────────────────────────
    const alertItem = target.closest('[data-alert-id]') as HTMLElement;
    if (alertItem) {
      const alertId = alertItem.getAttribute('data-alert-id')!;
      this.deps.alerts.acknowledge(alertId);
      return;
    }

    // ── Subsystem drill-down ──────────────────────────────────
    const sysCard = target.closest('[data-subsystem]') as HTMLElement;
    if (sysCard) {
      const sub = sysCard.getAttribute('data-subsystem') as Subsystem;
      this.deps.uiState.drillIntoSubsystem(sub);
      return;
    }

    // ── Procedure step completion ─────────────────────────────
    const procStep = target.closest('[data-proc-complete]') as HTMLElement;
    if (procStep) {
      const procId = procStep.getAttribute('data-proc-complete')!;
      this.deps.procedures.completeCurrentStep(procId);
      return;
    }

    const procSkip = target.closest('[data-proc-skip]') as HTMLElement;
    if (procSkip) {
      const procId = procSkip.getAttribute('data-proc-skip')!;
      this.deps.procedures.skipCurrentStep(procId);
      return;
    }

    const procBranch = target.closest('[data-proc-branch]') as HTMLElement;
    if (procBranch) {
      const procId = procBranch.getAttribute('data-proc-branch')!;
      const label = procBranch.getAttribute('data-branch-label')!;
      this.deps.procedures.selectBranch(procId, label);
      return;
    }

    // ── Procedure start ───────────────────────────────────────
    const procStart = target.closest('[data-proc-start]') as HTMLElement;
    if (procStart) {
      const procId = procStart.getAttribute('data-proc-start')!;
      this.deps.procedures.startProcedure(procId);
      return;
    }

    // ── Back button ───────────────────────────────────────────
    const backBtn = target.closest('[data-back]') as HTMLElement;
    if (backBtn) {
      this.deps.uiState.navigateTo('wall');
      return;
    }
  }

  private handleKey(e: KeyboardEvent): void {
    // Don't intercept if backtick (debug overlay) or if in input
    if (e.key === '`' || e.key === '~') return;
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;

    switch (e.key) {
      case ' ':
        e.preventDefault();
        this.deps.time.togglePause();
        break;

      case 'Escape':
        e.preventDefault();
        if (this.deps.uiState.getActivePanel() !== 'wall') {
          this.deps.uiState.navigateTo('wall');
        } else {
          this.deps.time.pause();
          // Could show pause menu here
        }
        break;

      case '+':
      case '=':
        this.deps.time.faster();
        break;

      case '-':
      case '_':
        this.deps.time.slower();
        break;

      // Number keys 1-8 for subsystem quick-focus
      case '1': this.deps.uiState.drillIntoSubsystem(Subsystem.Propulsion); break;
      case '2': this.deps.uiState.drillIntoSubsystem(Subsystem.Power); break;
      case '3': this.deps.uiState.drillIntoSubsystem(Subsystem.Thermal); break;
      case '4': this.deps.uiState.drillIntoSubsystem(Subsystem.ECLSS); break;
      case '5': this.deps.uiState.drillIntoSubsystem(Subsystem.Communications); break;
      case '6': this.deps.uiState.drillIntoSubsystem(Subsystem.GNC); break;
      case '7': this.deps.uiState.drillIntoSubsystem(Subsystem.Structures); break;
      case '8': this.deps.uiState.drillIntoSubsystem(Subsystem.Crew); break;

      // Tab cycles workstation tabs
      case 'Tab':
        e.preventDefault();
        // Cycle: alerts → commands → procedures → transcript
        const panels = ['alerts', 'commands', 'procedures', 'transcript'] as const;
        const current = this.deps.uiState.getActivePanel();
        // If we're in a subsystem view, go back to wall
        if (current === 'subsystem') {
          this.deps.uiState.navigateTo('wall');
        }
        break;

      // W = wall view
      case 'w':
      case 'W':
        this.deps.uiState.navigateTo('wall');
        break;
    }
  }

  private executeCommand(cmdId: string): void {
    const result = this.deps.commands.issueCommand(cmdId);
    if (!result) {
      // Command failed or on cooldown — could play error tone
    }

    // Special handling for mission authority commands
    if (cmdId === 'cmd_abort') {
      this.deps.mission.abortMission('Flight Director ordered abort');
      this.deps.time.pause();
      // Transition to debrief after a delay
      setTimeout(() => {
        this.deps.gameState.transitionTo(GameState.MissionDebrief);
      }, 2000);
    }
  }
}
