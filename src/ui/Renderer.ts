/**
 * Main Renderer — NASA MCC-accurate layout.
 *
 * TOP 40%:  The Wall (3 screens: Telemetry | Orbit | Ground Track)
 * BOTTOM 60%: The Floor (controller seats + Flight Director console)
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
import { UIStateManager } from './UIStateManager.js';
import { TelemetryPanel } from './panels/TelemetryPanel.js';
import { OrbitPanel } from './panels/OrbitPanel.js';
import { GroundTrackPanel } from './panels/GroundTrackPanel.js';
import { FloorView } from './panels/FloorView.js';
import { ControllerDetailPanel } from './panels/ControllerDetailPanel.js';
import { Severity } from '../types/common.js';

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
  private animFrameId: number | null = null;

  // Panels
  private telemetryPanel: TelemetryPanel;
  private orbitPanel: OrbitPanel;
  private groundTrackPanel: GroundTrackPanel;
  private floorView: FloorView;
  private controllerDetail: ControllerDetailPanel;

  // Cached DOM elements
  private metEl: HTMLElement | null = null;
  private missionNameEl: HTMLElement | null = null;
  private phaseEl: HTMLElement | null = null;
  private timeScaleEl: HTMLElement | null = null;
  private pauseBtnEl: HTMLElement | null = null;
  private telemetryContainer: HTMLElement | null = null;
  private orbitContainer: HTMLElement | null = null;
  private groundTrackContainer: HTMLElement | null = null;
  private floorContainer: HTMLElement | null = null;
  private fdConsoleEl: HTMLElement | null = null;
  private transcriptEl: HTMLElement | null = null;

  constructor(rootElement: HTMLElement, deps: RendererDependencies) {
    this.deps = deps;
    this.root = rootElement;

    this.telemetryPanel = new TelemetryPanel(deps);
    this.orbitPanel = new OrbitPanel(deps);
    this.groundTrackPanel = new GroundTrackPanel(deps);
    this.floorView = new FloorView(deps);
    this.controllerDetail = new ControllerDetailPanel(deps);

    this.setupLayout();
  }

  start(): void {
    this.renderLoop();
  }

  stop(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  private setupLayout(): void {
    this.root.innerHTML = '';
    this.root.className = 'mcc-root';

    const style = document.createElement('style');
    style.textContent = MCC_CSS;
    document.head.appendChild(style);

    // Top bar
    const topBar = document.createElement('div');
    topBar.className = 'mcc-top-bar';
    topBar.innerHTML = `
      <div class="mcc-met" id="mcc-met">+000/00:00:00</div>
      <div class="mcc-mission-name" id="mcc-mission-name">—</div>
      <div class="mcc-phase" id="mcc-phase">STANDBY</div>
      <div class="mcc-time-controls">
        <button class="mcc-btn mcc-btn-time" id="mcc-btn-slower">◀</button>
        <button class="mcc-btn mcc-btn-time" id="mcc-btn-pause">⏸</button>
        <button class="mcc-btn mcc-btn-time" id="mcc-btn-faster">▶</button>
        <span class="mcc-timescale" id="mcc-timescale">1.0x</span>
      </div>
    `;
    this.root.appendChild(topBar);

    // Wall (3 screens)
    const wall = document.createElement('div');
    wall.className = 'mcc-wall';
    wall.innerHTML = `
      <div class="mcc-wall-panel" id="mcc-telemetry"></div>
      <div class="mcc-wall-panel mcc-wall-center" id="mcc-orbit"></div>
      <div class="mcc-wall-panel" id="mcc-groundtrack"></div>
    `;
    this.root.appendChild(wall);

    // Floor
    const floor = document.createElement('div');
    floor.className = 'mcc-floor';
    floor.innerHTML = `
      <div class="mcc-room" id="mcc-room"></div>
      <div class="mcc-fd-console" id="mcc-fd-console"></div>
    `;
    this.root.appendChild(floor);

    // Transcript bar at very bottom
    const transcript = document.createElement('div');
    transcript.className = 'mcc-transcript-bar';
    transcript.id = 'mcc-transcript';
    this.root.appendChild(transcript);

    // Cache element refs
    this.metEl = document.getElementById('mcc-met');
    this.missionNameEl = document.getElementById('mcc-mission-name');
    this.phaseEl = document.getElementById('mcc-phase');
    this.timeScaleEl = document.getElementById('mcc-timescale');
    this.pauseBtnEl = document.getElementById('mcc-btn-pause');
    this.telemetryContainer = document.getElementById('mcc-telemetry');
    this.orbitContainer = document.getElementById('mcc-orbit');
    this.groundTrackContainer = document.getElementById('mcc-groundtrack');
    this.floorContainer = document.getElementById('mcc-room');
    this.fdConsoleEl = document.getElementById('mcc-fd-console');
    this.transcriptEl = document.getElementById('mcc-transcript');

    // Wire time controls
    document.getElementById('mcc-btn-pause')?.addEventListener('click', () => this.deps.time.togglePause());
    document.getElementById('mcc-btn-faster')?.addEventListener('click', () => this.deps.time.faster());
    document.getElementById('mcc-btn-slower')?.addEventListener('click', () => this.deps.time.slower());
  }

  private renderLoop = (): void => {
    this.render();
    this.animFrameId = requestAnimationFrame(this.renderLoop);
  };

  private render(): void {
    // Top bar (fast updates via textContent)
    if (this.metEl) this.metEl.textContent = this.deps.time.getFormattedMET();
    if (this.missionNameEl) {
      const def = this.deps.mission.getDefinition();
      this.missionNameEl.textContent = def?.name?.toUpperCase() ?? '—';
    }
    if (this.phaseEl) {
      const phase = this.deps.mission.getCurrentPhase();
      const paused = this.deps.time.isPaused();
      this.phaseEl.textContent = (phase?.toUpperCase().replace('_', ' ') ?? 'STANDBY') + (paused ? '  ▌▌ PAUSED' : '');
      this.phaseEl.className = 'mcc-phase' + (paused ? ' mcc-paused' : '');
    }
    if (this.timeScaleEl) this.timeScaleEl.textContent = `${this.deps.time.getTimeScale()}x`;
    if (this.pauseBtnEl) this.pauseBtnEl.textContent = this.deps.time.isPaused() ? '▶' : '⏸';

    // Wall panels
    if (this.telemetryContainer) this.telemetryPanel.render(this.telemetryContainer);
    if (this.orbitContainer) this.orbitPanel.render(this.orbitContainer);
    if (this.groundTrackContainer) this.groundTrackPanel.render(this.groundTrackContainer);

    // Floor — room or controller detail
    if (this.floorContainer) {
      const floorMode = this.deps.uiState.getFloorViewMode();
      if (floorMode === 'controller_detail') {
        const ctrlId = this.deps.uiState.getSelectedControllerId();
        if (ctrlId) {
          this.controllerDetail.render(this.floorContainer, ctrlId);
        }
      } else {
        this.floorView.render(this.floorContainer);
      }
    }

    // Flight Director console
    if (this.fdConsoleEl) this.renderFDConsole(this.fdConsoleEl);

    // Transcript bar
    if (this.transcriptEl) this.renderTranscript(this.transcriptEl);
  }

  private renderFDConsole(el: HTMLElement): void {
    const tab = this.deps.uiState.getState().fdConsoleTab;
    const alerts = this.deps.alerts.getActive();
    const unack = this.deps.alerts.getUnacknowledged().length;
    const activeProcs = this.deps.procedures.getActive();

    const tabBar = `
      <div class="mcc-fd-tabs">
        <button class="mcc-fd-tab ${tab === 'alerts' ? 'mcc-fd-tab-active' : ''}" data-fd-tab="alerts">ALERTS${unack > 0 ? ` (${unack})` : ''}</button>
        <button class="mcc-fd-tab ${tab === 'commands' ? 'mcc-fd-tab-active' : ''}" data-fd-tab="commands">CMDS</button>
        <button class="mcc-fd-tab ${tab === 'procedures' ? 'mcc-fd-tab-active' : ''}" data-fd-tab="procedures">PROCS${activeProcs.length > 0 ? ` (${activeProcs.length})` : ''}</button>
      </div>
    `;

    let content = '';
    switch (tab) {
      case 'alerts':
        content = alerts.length === 0
          ? '<div class="mcc-fd-empty">ALL NOMINAL</div>'
          : alerts.slice(0, 8).map(a => {
              const sevColor = a.severity === Severity.Critical ? '#EF4444' : a.severity === Severity.Warning ? '#F97316' : a.severity === Severity.Caution ? '#F59E0B' : '#2563EB';
              return `
                <div class="mcc-fd-alert" data-alert-id="${a.id}" style="border-left:3px solid ${sevColor};">
                  <div class="mcc-fd-alert-msg">${a.message}</div>
                  <div class="mcc-fd-alert-meta">${a.subsystem.toUpperCase()} ${a.acknowledged ? '✓' : ''}</div>
                </div>
              `;
            }).join('');
        break;

      case 'commands': {
        const cmdCategories = ['authority', 'strategy'] as const;
        content = cmdCategories.map(cat => {
          const cmds = this.deps.commands.getAvailableCommands(cat);
          return cmds.map(cmd => {
            const onCooldown = this.deps.commands.isOnCooldown(cmd.id);
            const isDanger = cmd.id === 'cmd_abort' || cmd.id === 'cmd_scrub';
            return `<button class="mcc-btn mcc-btn-cmd ${isDanger ? 'mcc-btn-danger' : ''}" data-cmd="${cmd.id}" ${onCooldown ? 'disabled' : ''}>${cmd.name}</button>`;
          }).join('');
        }).join('');
        break;
      }

      case 'procedures':
        if (activeProcs.length === 0) {
          content = '<div class="mcc-fd-empty">NO ACTIVE PROCEDURES</div>';
        } else {
          content = activeProcs.map(({ definition, state }) => {
            const currentStep = this.deps.procedures.getCurrentStep(definition.id);
            return `
              <div class="mcc-fd-proc">
                <div class="mcc-fd-proc-name">${definition.name}</div>
                ${currentStep ? `
                  <div class="mcc-fd-proc-step">${currentStep.step.instruction}</div>
                  <div class="mcc-fd-proc-actions">
                    ${currentStep.step.branches?.map(b =>
                      `<button class="mcc-btn mcc-btn-small" data-proc-branch="${definition.id}" data-branch-label="${b.label}">${b.label}</button>`
                    ).join('') ?? `
                      <button class="mcc-btn mcc-btn-small mcc-btn-go" data-proc-complete="${definition.id}">CONFIRM</button>
                      ${!currentStep.step.requiresConfirmation ? `<button class="mcc-btn mcc-btn-small" data-proc-skip="${definition.id}">SKIP</button>` : ''}
                    `}
                  </div>
                ` : ''}
              </div>
            `;
          }).join('');
        }
        break;
    }

    el.innerHTML = `${tabBar}<div class="mcc-fd-content">${content}</div>`;
  }

  private renderTranscript(el: HTMLElement): void {
    const recent = this.deps.dialogue.getHistory(1)[0];
    if (recent) {
      el.innerHTML = `<span class="mcc-transcript-callsign">${recent.callsign}:</span> ${recent.text}`;
    } else {
      el.innerHTML = '<span style="color:#64748B;">—</span>';
    }
  }
}

// ══════════════════════════════════════════════════════════════════
//  NASA MCC CSS
// ══════════════════════════════════════════════════════════════════

const MCC_CSS = `
  :root {
    --wall-bg: #F1F5F9;
    --wall-panel-bg: #FFFFFF;
    --wall-border: #CBD5E1;
    --wall-header-bg: #1E40AF;
    --wall-header-text: #FFFFFF;
    --wall-text: #1E293B;
    --wall-text-dim: #64748B;
    --floor-bg: #0F172A;
    --floor-panel-bg: #1E293B;
    --floor-border: #334155;
    --floor-text: #E2E8F0;
    --floor-text-dim: #94A3B8;
    --nasa-blue: #1E40AF;
    --nasa-blue-light: #3B82F6;
    --status-nominal: #2563EB;
    --status-caution: #F59E0B;
    --status-warning: #F97316;
    --status-critical: #EF4444;
    --status-go: #22C55E;
    --font-mono: 'Consolas','Courier New',monospace;
    --font-sans: -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  }

  * { margin:0; padding:0; box-sizing:border-box; }

  body {
    background: #0F172A;
    overflow: hidden;
    height: 100vh; width: 100vw;
  }

  .mcc-root {
    display: flex; flex-direction: column;
    height: 100vh; width: 100vw;
    font-family: var(--font-sans);
  }

  /* ── Top Bar ──────────────────────────────────── */
  .mcc-top-bar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 16px; height: 36px;
    background: var(--nasa-blue);
    color: white; font-size: 12px;
    flex-shrink: 0; z-index: 10;
  }
  .mcc-met {
    font-family: var(--font-mono); font-size: 18px; font-weight: 700;
    letter-spacing: 1px;
  }
  .mcc-mission-name { font-size: 13px; letter-spacing: 3px; font-weight: 600; }
  .mcc-phase { font-size: 12px; letter-spacing: 2px; opacity: 0.9; }
  .mcc-phase.mcc-paused { color: #FDE047; }
  .mcc-time-controls { display: flex; align-items: center; gap: 6px; }
  .mcc-btn-time {
    background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25);
    color: white; padding: 2px 10px; cursor: pointer; font-size: 12px;
    border-radius: 2px; font-family: var(--font-sans);
  }
  .mcc-btn-time:hover { background: rgba(255,255,255,0.25); }
  .mcc-timescale { font-family: var(--font-mono); font-size: 11px; opacity: 0.7; min-width: 32px; }

  /* ── Wall ──────────────────────────────────────── */
  .mcc-wall {
    display: flex; height: 45%;
    background: var(--wall-bg);
    border-bottom: 2px solid var(--nasa-blue);
    flex-shrink: 0;
  }
  .mcc-wall-panel {
    flex: 1; overflow: hidden;
    border-right: 1px solid var(--wall-border);
    background: var(--wall-panel-bg);
  }
  .mcc-wall-panel:last-child { border-right: none; }
  .mcc-wall-center { flex: 1.3; }
  .mcc-wall-header {
    background: var(--wall-header-bg); color: var(--wall-header-text);
    font-size: 10px; letter-spacing: 2px; padding: 4px 10px;
    font-weight: 600;
  }

  /* ── Telemetry Cards ──────────────────────────── */
  .mcc-telemetry-grid {
    display: grid; grid-template-columns: 1fr 1fr;
    gap: 4px; padding: 4px; overflow-y: auto;
    max-height: calc(100% - 24px);
  }
  .mcc-subsystem-card {
    background: #F8FAFC; border: 1px solid #E2E8F0;
    padding: 4px 6px; cursor: pointer;
    border-radius: 2px; transition: border-color 0.2s;
  }
  .mcc-subsystem-card:hover { border-color: var(--nasa-blue-light); }
  .mcc-status-border-nominal { border-left: 3px solid var(--status-nominal); }
  .mcc-status-border-advisory { border-left: 3px solid #3B82F6; }
  .mcc-status-border-caution { border-left: 3px solid var(--status-caution); }
  .mcc-status-border-warning { border-left: 3px solid var(--status-warning); }
  .mcc-status-border-critical { border-left: 3px solid var(--status-critical); }
  .mcc-status-border-failed { border-left: 3px solid var(--status-critical); background: #FEF2F2; }
  .mcc-card-header {
    display: flex; align-items: center; gap: 4px;
    font-size: 9px; margin-bottom: 2px;
  }
  .mcc-card-name { font-weight: 700; color: var(--wall-text); letter-spacing: 1px; }
  .mcc-card-status { margin-left: auto; font-size: 8px; color: var(--wall-text-dim); }
  .mcc-card-gauges { display: flex; gap: 2px; justify-content: center; flex-wrap: wrap; }

  /* ── Orbit Panel ──────────────────────────────── */
  .mcc-orbit-content { height: calc(100% - 24px); display: flex; flex-direction: column; }
  .mcc-orbit-svg { flex: 1; width: 100%; background: #0F172A; }
  .mcc-orbit-readouts {
    display: flex; gap: 12px; padding: 6px 12px; justify-content: center;
    background: #F8FAFC; border-top: 1px solid var(--wall-border);
  }
  .mcc-orbit-readout { text-align: center; }
  .mcc-readout-label { display: block; font-size: 8px; color: var(--wall-text-dim); letter-spacing: 1px; }
  .mcc-readout-value { font-family: var(--font-mono); font-size: 12px; font-weight: 600; }

  /* ── Ground Track ─────────────────────────────── */
  .mcc-map-content { height: calc(100% - 24px); display: flex; flex-direction: column; }
  .mcc-map-svg { flex: 1; width: 100%; }
  .mcc-map-status {
    display: flex; gap: 16px; padding: 6px 12px; justify-content: center;
    background: #F8FAFC; border-top: 1px solid var(--wall-border);
  }
  .mcc-map-stat { text-align: center; }

  /* ── Floor ─────────────────────────────────────── */
  .mcc-floor {
    flex: 1; display: flex;
    background: var(--floor-bg);
    overflow: hidden;
    min-height: 0;
  }
  .mcc-room {
    flex: 1; padding: 8px 16px;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 6px;
  }
  .mcc-room-row {
    display: flex; gap: 10px; justify-content: center;
  }
  .mcc-row-back { transform: scale(0.9); opacity: 0.8; }
  .mcc-row-middle { transform: scale(0.95); opacity: 0.9; }
  .mcc-row-front { transform: scale(1.0); }

  /* ── Controller Seats ─────────────────────────── */
  .mcc-controller-seat {
    width: 120px; background: var(--floor-panel-bg);
    border: 1px solid var(--floor-border);
    border-radius: 3px; cursor: pointer;
    transition: all 0.15s;
  }
  .mcc-controller-seat:hover {
    border-color: var(--nasa-blue-light);
    box-shadow: 0 0 12px rgba(59,130,246,0.15);
  }
  .mcc-seat-speaking { box-shadow: 0 0 16px rgba(59,130,246,0.3); }
  .mcc-seat-alert { }
  .mcc-seat-header {
    padding: 4px 8px; display: flex; align-items: center; justify-content: space-between;
    background: rgba(255,255,255,0.03);
  }
  .mcc-seat-callsign {
    font-size: 11px; font-weight: 700; letter-spacing: 1px; color: var(--floor-text);
  }
  .mcc-seat-badge {
    width: 8px; height: 8px; border-radius: 50%; background: var(--status-warning);
    animation: mcc-pulse 1.5s infinite;
  }
  @keyframes mcc-pulse {
    0%, 100% { opacity: 0.4; box-shadow: 0 0 4px rgba(249,115,22,0.3); }
    50% { opacity: 1; box-shadow: 0 0 12px rgba(249,115,22,0.6); }
  }
  .mcc-seat-body { padding: 6px 8px; }
  .mcc-seat-name { font-size: 10px; color: var(--floor-text-dim); }
  .mcc-seat-subsystem { font-size: 8px; color: var(--floor-text-dim); letter-spacing: 1px; margin: 2px 0; }
  .mcc-seat-vote {
    font-size: 10px; font-weight: 700; letter-spacing: 1px;
    display: flex; align-items: center; gap: 4px;
  }
  .mcc-vote-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }

  .mcc-seat-flight { border-color: var(--nasa-blue); }
  .mcc-seat-flight .mcc-seat-header { background: rgba(30,64,175,0.15); }

  /* ── Status Dot ───────────────────────────────── */
  .mcc-status-dot {
    display: inline-block; border-radius: 50%; flex-shrink: 0;
  }
  .mcc-pulse {
    animation: mcc-dot-pulse 1s infinite;
  }
  @keyframes mcc-dot-pulse {
    0%, 100% { opacity: 0.5; }
    50% { opacity: 1; }
  }

  /* ── FD Console ───────────────────────────────── */
  .mcc-fd-console {
    width: 260px; flex-shrink: 0;
    background: #1E293B;
    border-left: 1px solid var(--floor-border);
    display: flex; flex-direction: column;
    overflow: hidden;
  }
  .mcc-fd-tabs {
    display: flex; border-bottom: 1px solid var(--floor-border);
  }
  .mcc-fd-tab {
    flex: 1; padding: 6px 4px; font-size: 9px; letter-spacing: 1px;
    background: transparent; border: none; color: var(--floor-text-dim);
    cursor: pointer; font-family: var(--font-sans);
    border-bottom: 2px solid transparent;
  }
  .mcc-fd-tab:hover { color: var(--floor-text); }
  .mcc-fd-tab-active { color: var(--nasa-blue-light); border-bottom-color: var(--nasa-blue-light); }
  .mcc-fd-content { flex: 1; overflow-y: auto; padding: 6px; }
  .mcc-fd-empty { color: var(--status-nominal); font-size: 11px; text-align: center; padding: 20px; }
  .mcc-fd-alert {
    padding: 6px 8px; margin-bottom: 4px;
    background: rgba(255,255,255,0.03);
    border-radius: 2px; cursor: pointer;
  }
  .mcc-fd-alert:hover { background: rgba(255,255,255,0.06); }
  .mcc-fd-alert-msg { font-size: 11px; color: var(--floor-text); }
  .mcc-fd-alert-meta { font-size: 9px; color: var(--floor-text-dim); margin-top: 2px; }
  .mcc-fd-proc { margin-bottom: 8px; padding: 6px; background: rgba(255,255,255,0.03); border-radius: 2px; }
  .mcc-fd-proc-name { font-size: 10px; font-weight: 600; color: var(--nasa-blue-light); letter-spacing: 1px; }
  .mcc-fd-proc-step { font-size: 11px; color: var(--floor-text); margin: 4px 0; line-height: 1.4; }
  .mcc-fd-proc-actions { display: flex; gap: 4px; flex-wrap: wrap; }

  /* ── Buttons ──────────────────────────────────── */
  .mcc-btn {
    background: var(--floor-panel-bg); color: var(--floor-text);
    border: 1px solid var(--floor-border); padding: 4px 10px;
    font-size: 10px; cursor: pointer; font-family: var(--font-sans);
    border-radius: 2px; letter-spacing: 0.5px;
    transition: all 0.1s;
  }
  .mcc-btn:hover:not(:disabled) { border-color: var(--nasa-blue-light); color: var(--nasa-blue-light); }
  .mcc-btn:disabled { opacity: 0.35; cursor: not-allowed; }
  .mcc-btn-cmd { text-transform: uppercase; font-size: 9px; letter-spacing: 1px; }
  .mcc-btn-danger:hover:not(:disabled) { border-color: var(--status-critical); color: var(--status-critical); }
  .mcc-btn-go { border-color: var(--status-go); color: var(--status-go); }
  .mcc-btn-small { font-size: 9px; padding: 2px 6px; }
  .mcc-btn-back { background: transparent; }

  /* ── Transcript Bar ───────────────────────────── */
  .mcc-transcript-bar {
    height: 28px; padding: 0 16px;
    display: flex; align-items: center;
    background: #1E293B; border-top: 1px solid var(--floor-border);
    font-size: 11px; color: var(--floor-text);
    font-family: var(--font-mono);
    overflow: hidden; white-space: nowrap;
    flex-shrink: 0;
  }
  .mcc-transcript-callsign { color: var(--nasa-blue-light); font-weight: 700; margin-right: 6px; }

  /* ── Controller Detail ────────────────────────── */
  .mcc-detail-panel { height: 100%; display: flex; flex-direction: column; }
  .mcc-detail-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 16px; border-bottom: 1px solid var(--floor-border);
  }
  .mcc-detail-title { display: flex; align-items: center; gap: 8px; }
  .mcc-detail-callsign { font-size: 16px; font-weight: 700; color: var(--floor-text); letter-spacing: 2px; }
  .mcc-detail-name { font-size: 12px; color: var(--floor-text-dim); }
  .mcc-detail-body {
    flex: 1; display: grid; grid-template-columns: 1fr 1fr;
    gap: 16px; padding: 12px 16px; overflow-y: auto;
  }
  .mcc-detail-section-title {
    font-size: 9px; letter-spacing: 2px; color: var(--nasa-blue-light);
    border-bottom: 1px solid var(--floor-border);
    padding-bottom: 3px; margin-bottom: 6px;
  }
  .mcc-detail-gauges { display: flex; flex-wrap: wrap; gap: 4px; }
  .mcc-detail-recommendation {
    background: rgba(249,115,22,0.08); border-left: 3px solid var(--status-warning);
    padding: 8px; font-size: 11px; color: var(--floor-text);
    margin-bottom: 10px; line-height: 1.5;
  }
  .mcc-detail-commands { display: flex; flex-wrap: wrap; gap: 4px; }
  .mcc-detail-proc-item {
    display: flex; justify-content: space-between; align-items: center;
    padding: 4px 0; border-bottom: 1px solid rgba(51,65,85,0.3);
    font-size: 11px; color: var(--floor-text);
  }
  .mcc-detail-dialogue-line {
    font-size: 11px; padding: 3px 0;
    border-bottom: 1px solid rgba(51,65,85,0.3);
    color: var(--floor-text);
  }
  .mcc-detail-empty { color: var(--floor-text-dim); text-align: center; padding: 40px; }

  /* ── Bar Gauge ────────────────────────────────── */
  .mcc-bar-gauge { margin-bottom: 4px; }
  .mcc-bar-label {
    display: flex; justify-content: space-between;
    font-size: 9px; color: var(--floor-text-dim); margin-bottom: 2px;
  }
  .mcc-bar-track { height: 5px; background: var(--floor-border); border-radius: 2px; }
  .mcc-bar-fill { height: 100%; border-radius: 2px; transition: width 0.3s; }

  /* ── Gauge SVG ────────────────────────────────── */
  .mcc-gauge text { user-select: none; }
`;
