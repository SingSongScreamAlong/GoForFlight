/**
 * Wall Display — the main mission control "big screen" view.
 *
 * Shows: system overview grid, trajectory placeholder,
 * event log, resource margins, mission timeline.
 */

import { RendererDependencies } from '../Renderer.js';
import { Subsystem, Status } from '../../types/common.js';

export class WallDisplay {
  private deps: RendererDependencies;

  constructor(deps: RendererDependencies) {
    this.deps = deps;
  }

  render(container: HTMLElement): void {
    const mission = this.deps.mission;
    const sim = this.deps.simulation;
    const alerts = this.deps.alerts;
    const time = this.deps.time;

    // System overview — all subsystem params at a glance
    const systemOverview = this.renderSystemOverview();

    // Trajectory/orbit placeholder
    const trajectory = this.renderTrajectoryPlaceholder();

    // Event log — recent events
    const eventLog = this.renderEventLog();

    // Resource margins
    const resources = this.renderResources();

    container.innerHTML = `
      <div class="gff-wall-grid">
        <div class="gff-wall-panel">
          <div class="gff-wall-panel-title">SYSTEMS OVERVIEW</div>
          ${systemOverview}
        </div>
        <div class="gff-wall-panel">
          <div class="gff-wall-panel-title">TRAJECTORY</div>
          ${trajectory}
        </div>
        <div class="gff-wall-panel">
          <div class="gff-wall-panel-title">EVENT LOG</div>
          ${eventLog}
        </div>
        <div class="gff-wall-panel">
          <div class="gff-wall-panel-title">RESOURCES</div>
          ${resources}
        </div>
      </div>
    `;
  }

  private renderSystemOverview(): string {
    const subsystems = Object.values(Subsystem);
    const rows = subsystems.map(sub => {
      const sim = this.deps.simulation.getSubsystem(sub);
      if (!sim) return '';

      const state = sim.getState();
      const params = Array.from(state.parameters.entries())
        .slice(0, 4) // show top 4 params per subsystem
        .map(([name, value]) => {
          const range = state.nominalRanges.get(name);
          const statusClass = this.getValueStatusClass(value, range);
          const formatted = typeof value === 'number' ? value.toFixed(2) : String(value);
          return `<span class="gff-param-value ${statusClass}">${name}: ${formatted}</span>`;
        })
        .join(' &nbsp;|&nbsp; ');

      return `
        <div class="gff-param-row" style="flex-wrap:wrap;">
          <span class="gff-param-name" style="min-width:80px;">${sub.toUpperCase()}</span>
          <span style="font-size:10px;">${params}</span>
        </div>
      `;
    });

    return rows.join('');
  }

  private renderTrajectoryPlaceholder(): string {
    const phase = this.deps.mission.getCurrentPhase();
    const gnc = this.deps.simulation.getSubsystem(Subsystem.GNC);
    const deviation = gnc?.getParameter('deviationFromPlanKm') ?? 0;
    const confidence = gnc?.getParameter('sensorConfidence') ?? 0;
    const corrWindow = gnc?.getParameter('nextCorrectionWindowSec') ?? 0;

    return `
      <div style="display:flex;flex-direction:column;gap:8px;height:100%;justify-content:center;align-items:center;">
        <div style="font-size:48px;color:var(--cyan);opacity:0.3;">◎</div>
        <div style="color:var(--text-dim);font-size:10px;">PHASE: ${phase?.toUpperCase() ?? 'N/A'}</div>
        <div class="gff-param-row" style="width:80%;">
          <span class="gff-param-name">DEVIATION</span>
          <span class="gff-param-value ${deviation > 5 ? 'gff-warning' : 'gff-nominal'}">${deviation.toFixed(2)} km</span>
        </div>
        <div class="gff-param-row" style="width:80%;">
          <span class="gff-param-name">NAV CONFIDENCE</span>
          <span class="gff-param-value ${confidence < 0.8 ? 'gff-caution' : 'gff-nominal'}">${(confidence * 100).toFixed(1)}%</span>
        </div>
        <div class="gff-param-row" style="width:80%;">
          <span class="gff-param-name">NEXT CORRECTION</span>
          <span class="gff-param-value">${this.formatSeconds(corrWindow)}</span>
        </div>
      </div>
    `;
  }

  private renderEventLog(): string {
    const history = this.deps.eventBus.getHistory(undefined, 15);
    const relevant = history.filter(h =>
      h.event.startsWith('alert:') ||
      h.event.startsWith('phase:') ||
      h.event.startsWith('command:') ||
      h.event.startsWith('anomaly:') ||
      h.event.startsWith('procedure:')
    ).slice(-10);

    if (relevant.length === 0) {
      return '<div style="color:var(--text-dim);font-size:10px;">No events yet</div>';
    }

    return relevant.map(ev => {
      const met = this.deps.time.getFormattedMET();
      return `<div style="font-size:10px;padding:2px 0;border-bottom:1px solid rgba(42,42,58,0.3);">
        <span style="color:var(--text-dim);">${ev.event}</span>
      </div>`;
    }).join('');
  }

  private renderResources(): string {
    const getPropellant = () => {
      const prop = this.deps.simulation.getSubsystem(Subsystem.Propulsion);
      return prop?.getParameter('fuelRemaining') ?? 1;
    };

    const getPower = () => {
      const power = this.deps.simulation.getSubsystem(Subsystem.Power);
      return power?.getParameter('avgBatteryCharge') ?? 1;
    };

    const getO2 = () => {
      const eclss = this.deps.simulation.getSubsystem(Subsystem.ECLSS);
      return (eclss?.getParameter('o2ReserveKg') ?? 100) / 100;
    };

    const getWater = () => {
      const eclss = this.deps.simulation.getSubsystem(Subsystem.ECLSS);
      return (eclss?.getParameter('waterReserveKg') ?? 50) / 50;
    };

    const bars = [
      { label: 'PROPELLANT', value: getPropellant() },
      { label: 'POWER', value: getPower() },
      { label: 'OXYGEN', value: getO2() },
      { label: 'WATER', value: getWater() },
    ];

    return bars.map(b => {
      const pct = Math.max(0, Math.min(100, b.value * 100));
      const color = pct > 30 ? 'var(--green)' : pct > 15 ? 'var(--yellow)' : 'var(--red)';
      return `
        <div style="margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:2px;">
            <span style="color:var(--text-dim);">${b.label}</span>
            <span style="color:${color};">${pct.toFixed(1)}%</span>
          </div>
          <div style="height:6px;background:var(--bg-secondary);border:1px solid var(--border);">
            <div style="height:100%;width:${pct}%;background:${color};transition:width 0.3s;"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  private getValueStatusClass(value: number, range?: { nominalMin?: number; nominalMax?: number; cautionMax?: number; warningMax?: number }): string {
    if (!range) return '';
    if (range.warningMax !== undefined && value > range.warningMax) return 'gff-warning';
    if (range.cautionMax !== undefined && value > range.cautionMax) return 'gff-caution';
    if (range.nominalMax !== undefined && value > range.nominalMax) return 'gff-caution';
    if (range.nominalMin !== undefined && value < range.nominalMin) return 'gff-caution';
    return 'gff-nominal';
  }

  private formatSeconds(sec: number): string {
    if (sec <= 0) return 'NOW';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }
}
