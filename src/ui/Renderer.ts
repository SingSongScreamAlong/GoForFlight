/**
 * Main Renderer — renders the entire game UI to the DOM.
 *
 * Orchestrates all visual panels: wall display, workstation,
 * alert queue, subsystem views, etc.
 *
 * Uses direct DOM manipulation for control room authenticity.
 */

import { EventBus } from '../core/EventBus.js';
import { TimeController } from '../core/TimeController.js';
import { MissionRuntime } from '../core/MissionRuntime.js';
import { SimulationManager } from '../core/SimulationManager.js';
import { AlertEngine } from '../alerts/AlertEngine.js';
import { ControllerFramework } from '../controllers/ControllerFramework.js';
import { DialogueSystem } from '../controllers/DialogueSystem.js';
import { ProcedureRunner } from '../procedures/ProcedureRunner.js';
import { CommandSystem } from '../commands/CommandSystem.js';
import { UIStateManager, UIPanel } from './UIStateManager.js';
import { WallDisplay } from './panels/WallDisplay.js';
import { WorkstationUI } from './panels/WorkstationUI.js';
import { SubsystemView } from './panels/SubsystemView.js';
import { Subsystem, Severity, Status } from '../types/common.js';

export interface RendererDependencies {
  eventBus: EventBus;
  time: TimeController;
  mission: MissionRuntime;
  simulation: SimulationManager;
  alerts: AlertEngine;
  controllers: ControllerFramework;
  dialogue: DialogueSystem;
  procedures: ProcedureRunner;
  commands: CommandSystem;
  uiState: UIStateManager;
}

export class Renderer {
  private deps: RendererDependencies;
  private root: HTMLElement;
  private wallDisplay: WallDisplay;
  private workstation: WorkstationUI;
  private subsystemView: SubsystemView;
  private animFrameId: number | null = null;

  constructor(rootElement: HTMLElement, deps: RendererDependencies) {
    this.deps = deps;
    this.root = rootElement;

    this.wallDisplay = new WallDisplay(deps);
    this.workstation = new WorkstationUI(deps);
    this.subsystemView = new SubsystemView(deps);

    this.setupLayout();
  }

  /** Start render loop. */
  start(): void {
    this.renderLoop();
  }

  /** Stop render loop. */
  stop(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
    }
  }

  private setupLayout(): void {
    this.root.innerHTML = '';
    this.root.className = 'gff-root';

    // Apply base styles
    const style = document.createElement('style');
    style.textContent = CSS_BASE;
    document.head.appendChild(style);

    // Top bar: MET timer + mission info
    const topBar = this.createElement('div', 'gff-top-bar');
    topBar.innerHTML = `
      <div class="gff-met" id="gff-met">+000/00:00:00</div>
      <div class="gff-mission-name" id="gff-mission-name">NO MISSION LOADED</div>
      <div class="gff-phase" id="gff-phase">STANDBY</div>
      <div class="gff-time-controls" id="gff-time-controls">
        <button class="gff-btn" id="gff-btn-slower">◁</button>
        <button class="gff-btn" id="gff-btn-pause">⏸</button>
        <button class="gff-btn" id="gff-btn-faster">▷</button>
        <span class="gff-timescale" id="gff-timescale">1.0x</span>
      </div>
    `;
    this.root.appendChild(topBar);

    // Main content area
    const main = this.createElement('div', 'gff-main');

    // Left: System status cards
    const leftPanel = this.createElement('div', 'gff-left-panel');
    leftPanel.id = 'gff-system-cards';
    main.appendChild(leftPanel);

    // Center: Primary display (wall/subsystem/procedures)
    const centerPanel = this.createElement('div', 'gff-center-panel');
    centerPanel.id = 'gff-center';
    main.appendChild(centerPanel);

    // Right: Workstation (alerts, dialogue, commands)
    const rightPanel = this.createElement('div', 'gff-right-panel');
    rightPanel.id = 'gff-workstation';
    main.appendChild(rightPanel);

    this.root.appendChild(main);

    // Bottom bar: Controller channel
    const bottomBar = this.createElement('div', 'gff-bottom-bar');
    bottomBar.id = 'gff-controller-bar';
    this.root.appendChild(bottomBar);

    // Wire up time controls
    document.getElementById('gff-btn-pause')?.addEventListener('click', () => this.deps.time.togglePause());
    document.getElementById('gff-btn-faster')?.addEventListener('click', () => this.deps.time.faster());
    document.getElementById('gff-btn-slower')?.addEventListener('click', () => this.deps.time.slower());
  }

  private renderLoop = (): void => {
    this.render();
    this.animFrameId = requestAnimationFrame(this.renderLoop);
  };

  private render(): void {
    // Top bar
    this.updateTopBar();

    // System cards (left panel)
    this.renderSystemCards();

    // Center panel
    this.renderCenterPanel();

    // Workstation (right panel)
    this.workstation.render(document.getElementById('gff-workstation')!);

    // Controller bar
    this.renderControllerBar();
  }

  private updateTopBar(): void {
    const metEl = document.getElementById('gff-met');
    if (metEl) metEl.textContent = this.deps.time.getFormattedMET();

    const nameEl = document.getElementById('gff-mission-name');
    if (nameEl) {
      const def = this.deps.mission.getDefinition();
      nameEl.textContent = def?.name?.toUpperCase() ?? 'NO MISSION';
    }

    const phaseEl = document.getElementById('gff-phase');
    if (phaseEl) {
      const phase = this.deps.mission.getCurrentPhase();
      phaseEl.textContent = phase?.toUpperCase().replace('_', ' ') ?? 'STANDBY';
      phaseEl.className = 'gff-phase' + (this.deps.time.isPaused() ? ' gff-paused' : '');
    }

    const scaleEl = document.getElementById('gff-timescale');
    if (scaleEl) scaleEl.textContent = `${this.deps.time.getTimeScale()}x`;

    const pauseBtn = document.getElementById('gff-btn-pause');
    if (pauseBtn) pauseBtn.textContent = this.deps.time.isPaused() ? '▶' : '⏸';
  }

  private renderSystemCards(): void {
    const container = document.getElementById('gff-system-cards');
    if (!container) return;

    const subsystems = Object.values(Subsystem);
    const cards = subsystems.map(sub => {
      const sim = this.deps.simulation.getSubsystem(sub);
      const state = sim?.getState();
      const status = state?.status ?? Status.Unknown;
      const alerts = this.deps.alerts.getBySubsystem(sub);

      return `
        <div class="gff-sys-card gff-status-${status}" data-subsystem="${sub}">
          <div class="gff-sys-name">${sub.toUpperCase()}</div>
          <div class="gff-sys-status">${status.toUpperCase()}</div>
          ${alerts.length > 0 ? `<div class="gff-sys-alerts">${alerts.length} alert${alerts.length > 1 ? 's' : ''}</div>` : ''}
        </div>
      `;
    });

    container.innerHTML = cards.join('');

    // Click handlers for drill-down
    container.querySelectorAll('.gff-sys-card').forEach(card => {
      card.addEventListener('click', () => {
        const sub = card.getAttribute('data-subsystem') as Subsystem;
        this.deps.uiState.drillIntoSubsystem(sub);
      });
    });
  }

  private renderCenterPanel(): void {
    const container = document.getElementById('gff-center');
    if (!container) return;

    const activePanel = this.deps.uiState.getActivePanel();

    switch (activePanel) {
      case 'wall':
        this.wallDisplay.render(container);
        break;
      case 'subsystem':
        this.subsystemView.render(container);
        break;
      default:
        this.wallDisplay.render(container);
    }
  }

  private renderControllerBar(): void {
    const container = document.getElementById('gff-controller-bar');
    if (!container) return;

    const controllers = this.deps.controllers.getAll();
    const lines = this.deps.dialogue.peekQueue(3);
    const recentLine = this.deps.dialogue.getHistory(1)[0];

    const ctrlCards = controllers.map(c => `
      <div class="gff-ctrl-card gff-go-${c.currentAssessment}">
        <div class="gff-ctrl-callsign">${c.callsign}</div>
        <div class="gff-ctrl-vote">${c.currentAssessment.toUpperCase()}</div>
      </div>
    `).join('');

    const transcript = recentLine
      ? `<div class="gff-transcript-line">${recentLine.callsign}: ${recentLine.text}</div>`
      : '<div class="gff-transcript-line">—</div>';

    container.innerHTML = `
      <div class="gff-ctrl-roster">${ctrlCards}</div>
      <div class="gff-transcript-bar">${transcript}</div>
    `;
  }

  private createElement(tag: string, className: string): HTMLElement {
    const el = document.createElement(tag);
    el.className = className;
    return el;
  }
}

// ── CSS ──────────────────────────────────────────────────────────

const CSS_BASE = `
  :root {
    --bg-primary: #0a0a0f;
    --bg-secondary: #12121a;
    --bg-panel: #1a1a25;
    --border: #2a2a3a;
    --text-primary: #c8c8d4;
    --text-dim: #666680;
    --green: #00ff88;
    --green-dim: #00aa55;
    --yellow: #ffcc00;
    --orange: #ff8800;
    --red: #ff3344;
    --blue: #4488ff;
    --cyan: #00ccff;
    --font-mono: 'Courier New', 'Consolas', monospace;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    background: var(--bg-primary);
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: 12px;
    overflow: hidden;
    height: 100vh;
    width: 100vw;
  }

  .gff-root {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
  }

  /* Top Bar */
  .gff-top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 16px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
    height: 40px;
    flex-shrink: 0;
  }

  .gff-met {
    font-size: 20px;
    font-weight: bold;
    color: var(--green);
    letter-spacing: 2px;
    text-shadow: 0 0 10px rgba(0, 255, 136, 0.3);
  }

  .gff-mission-name {
    font-size: 14px;
    color: var(--text-primary);
    letter-spacing: 3px;
  }

  .gff-phase {
    font-size: 13px;
    color: var(--cyan);
    letter-spacing: 2px;
  }

  .gff-phase.gff-paused {
    color: var(--yellow);
  }

  .gff-phase.gff-paused::after {
    content: ' [PAUSED]';
  }

  .gff-time-controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .gff-btn {
    background: var(--bg-panel);
    color: var(--text-primary);
    border: 1px solid var(--border);
    padding: 2px 8px;
    cursor: pointer;
    font-family: var(--font-mono);
    font-size: 14px;
  }

  .gff-btn:hover { border-color: var(--green); color: var(--green); }

  .gff-timescale {
    color: var(--text-dim);
    font-size: 11px;
    min-width: 40px;
  }

  /* Main Layout */
  .gff-main {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .gff-left-panel {
    width: 140px;
    flex-shrink: 0;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow-y: auto;
    border-right: 1px solid var(--border);
  }

  .gff-center-panel {
    flex: 1;
    padding: 8px;
    overflow: auto;
  }

  .gff-right-panel {
    width: 320px;
    flex-shrink: 0;
    padding: 8px;
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-y: auto;
  }

  /* System Cards */
  .gff-sys-card {
    padding: 8px;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-left: 3px solid var(--green);
    cursor: pointer;
    transition: border-color 0.2s;
  }

  .gff-sys-card:hover { border-color: var(--cyan); }

  .gff-sys-card.gff-status-nominal { border-left-color: var(--green); }
  .gff-sys-card.gff-status-advisory { border-left-color: var(--cyan); }
  .gff-sys-card.gff-status-caution { border-left-color: var(--yellow); }
  .gff-sys-card.gff-status-warning { border-left-color: var(--orange); }
  .gff-sys-card.gff-status-critical { border-left-color: var(--red); }
  .gff-sys-card.gff-status-failed { border-left-color: var(--red); background: #1a0a0a; }

  .gff-sys-name { font-size: 10px; color: var(--text-dim); letter-spacing: 1px; }
  .gff-sys-status { font-size: 12px; font-weight: bold; margin-top: 2px; }
  .gff-sys-alerts { font-size: 9px; color: var(--orange); margin-top: 4px; }

  .gff-status-nominal .gff-sys-status { color: var(--green); }
  .gff-status-caution .gff-sys-status { color: var(--yellow); }
  .gff-status-warning .gff-sys-status { color: var(--orange); }
  .gff-status-critical .gff-sys-status { color: var(--red); }
  .gff-status-failed .gff-sys-status { color: var(--red); }

  /* Controller Bar */
  .gff-bottom-bar {
    display: flex;
    align-items: center;
    padding: 6px 16px;
    background: var(--bg-secondary);
    border-top: 1px solid var(--border);
    height: 52px;
    flex-shrink: 0;
    gap: 12px;
  }

  .gff-ctrl-roster {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
  }

  .gff-ctrl-card {
    padding: 4px 10px;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    text-align: center;
    min-width: 70px;
  }

  .gff-ctrl-callsign { font-size: 9px; color: var(--text-dim); }
  .gff-ctrl-vote { font-size: 11px; font-weight: bold; }

  .gff-go-go .gff-ctrl-vote { color: var(--green); }
  .gff-go-no_go .gff-ctrl-vote { color: var(--red); }
  .gff-go-standby .gff-ctrl-vote { color: var(--yellow); }

  .gff-transcript-bar {
    flex: 1;
    overflow: hidden;
  }

  .gff-transcript-line {
    color: var(--text-primary);
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Section headers */
  .gff-section-header {
    font-size: 10px;
    color: var(--text-dim);
    letter-spacing: 2px;
    padding: 4px 0;
    border-bottom: 1px solid var(--border);
    margin-bottom: 4px;
  }

  /* Alert items */
  .gff-alert-item {
    padding: 6px 8px;
    background: var(--bg-panel);
    border-left: 3px solid var(--border);
    margin-bottom: 4px;
    font-size: 11px;
    cursor: pointer;
  }

  .gff-alert-item.gff-sev-caution { border-left-color: var(--yellow); }
  .gff-alert-item.gff-sev-warning { border-left-color: var(--orange); }
  .gff-alert-item.gff-sev-critical { border-left-color: var(--red); background: #1a0808; }

  .gff-alert-msg { color: var(--text-primary); }
  .gff-alert-meta { font-size: 9px; color: var(--text-dim); margin-top: 2px; }

  /* Parameter display */
  .gff-param-row {
    display: flex;
    justify-content: space-between;
    padding: 3px 0;
    border-bottom: 1px solid rgba(42, 42, 58, 0.5);
    font-size: 11px;
  }

  .gff-param-name { color: var(--text-dim); }
  .gff-param-value { color: var(--text-primary); font-weight: bold; }
  .gff-param-value.gff-nominal { color: var(--green); }
  .gff-param-value.gff-caution { color: var(--yellow); }
  .gff-param-value.gff-warning { color: var(--orange); }
  .gff-param-value.gff-critical { color: var(--red); }

  /* Wall display specific */
  .gff-wall-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    gap: 8px;
    height: 100%;
  }

  .gff-wall-panel {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    padding: 8px;
    overflow: auto;
  }

  .gff-wall-panel-title {
    font-size: 10px;
    color: var(--text-dim);
    letter-spacing: 2px;
    margin-bottom: 6px;
  }

  /* Procedure display */
  .gff-proc-step {
    padding: 6px 8px;
    margin-bottom: 2px;
    font-size: 11px;
    border-left: 2px solid var(--border);
  }

  .gff-proc-step.gff-step-current { border-left-color: var(--cyan); background: rgba(0, 204, 255, 0.05); }
  .gff-proc-step.gff-step-completed { border-left-color: var(--green); color: var(--text-dim); }
  .gff-proc-step.gff-step-skipped { border-left-color: var(--yellow); color: var(--text-dim); text-decoration: line-through; }

  /* Command buttons */
  .gff-cmd-btn {
    background: var(--bg-panel);
    color: var(--text-primary);
    border: 1px solid var(--border);
    padding: 6px 12px;
    cursor: pointer;
    font-family: var(--font-mono);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 1px;
    transition: all 0.15s;
  }

  .gff-cmd-btn:hover { border-color: var(--green); color: var(--green); }
  .gff-cmd-btn.gff-cmd-danger:hover { border-color: var(--red); color: var(--red); }
  .gff-cmd-btn:disabled { opacity: 0.3; cursor: not-allowed; }
`;
