/**
 * Subsystem Deep-Dive View — detailed view of a single subsystem.
 *
 * Shows all parameters, fault status, history trends (text-based),
 * related alerts, and available procedures.
 */

import { RendererDependencies } from '../Renderer.js';
import { Subsystem, Status, ValueRange } from '../../types/common.js';

export class SubsystemView {
  private deps: RendererDependencies;

  constructor(deps: RendererDependencies) {
    this.deps = deps;
  }

  render(container: HTMLElement): void {
    const uiState = this.deps.uiState.getState();
    const subsystem = uiState.selectedSubsystem;

    if (!subsystem) {
      container.innerHTML = '<div style="color:var(--text-dim);padding:20px;">Select a subsystem</div>';
      return;
    }

    const sim = this.deps.simulation.getSubsystem(subsystem);
    if (!sim) {
      container.innerHTML = `<div style="color:var(--red);">Subsystem ${subsystem} not found</div>`;
      return;
    }

    const state = sim.getState();
    const alerts = this.deps.alerts.getBySubsystem(subsystem);
    const controller = this.deps.controllers.getBySubsystem(subsystem);

    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <div>
          <div style="font-size:16px;letter-spacing:3px;color:var(--cyan);">${subsystem.toUpperCase()}</div>
          <div style="font-size:11px;color:var(--text-dim);">
            Status: <span class="gff-param-value gff-${state.status}">${state.status.toUpperCase()}</span>
            ${controller ? ` | Controller: ${controller.callsign}` : ''}
          </div>
        </div>
        <button class="gff-cmd-btn" onclick="document.querySelector('.gff-root').__uiState?.navigateTo('wall')">← BACK</button>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <div class="gff-section-header">PARAMETERS</div>
          ${this.renderParameters(state.parameters, state.nominalRanges)}
        </div>
        <div>
          <div class="gff-section-header">FAULTS</div>
          ${this.renderFaults(state.faults)}

          <div class="gff-section-header" style="margin-top:12px;">ALERTS</div>
          ${this.renderAlerts(alerts)}

          ${controller ? `
            <div class="gff-section-header" style="margin-top:12px;">CONTROLLER</div>
            ${this.renderController(controller)}
          ` : ''}
        </div>
      </div>

      <div style="margin-top:12px;">
        <div class="gff-section-header">TREND HISTORY (LAST 30 READINGS)</div>
        ${this.renderTrends(state.history)}
      </div>
    `;
  }

  private renderParameters(params: Map<string, number>, ranges: Map<string, ValueRange>): string {
    const rows = Array.from(params.entries()).map(([name, value]) => {
      const range = ranges.get(name);
      const statusClass = this.getParamClass(value, range);
      const rangeStr = range ? ` [${range.nominalMin?.toFixed(1) ?? '?'} – ${range.nominalMax?.toFixed(1) ?? '?'}]` : '';

      return `
        <div class="gff-param-row">
          <span class="gff-param-name">${name}</span>
          <span class="gff-param-value ${statusClass}">${value.toFixed(3)}</span>
        </div>
      `;
    });

    return rows.join('');
  }

  private renderFaults(faults: Array<{ id: string; hidden: boolean; severity: number; affectedParameters: string[]; timeActive: number }>): string {
    if (faults.length === 0) {
      return '<div style="color:var(--green);font-size:10px;padding:4px;">No active faults</div>';
    }

    return faults.map(f => `
      <div style="padding:4px 0;border-bottom:1px solid var(--border);font-size:10px;">
        <div style="color:${f.hidden ? 'var(--text-dim)' : 'var(--orange)'};">
          ${f.hidden ? '[HIDDEN] ' : ''}${f.id}
        </div>
        <div style="color:var(--text-dim);">
          Severity: ${f.severity.toFixed(2)} | Active: ${f.timeActive.toFixed(0)}s | Params: ${f.affectedParameters.join(', ')}
        </div>
      </div>
    `).join('');
  }

  private renderAlerts(alerts: Array<{ severity: string; message: string; createdAt: number; acknowledged: boolean }>): string {
    if (alerts.length === 0) {
      return '<div style="color:var(--green);font-size:10px;padding:4px;">No alerts</div>';
    }

    return alerts.map(a => `
      <div class="gff-alert-item gff-sev-${a.severity}">
        <div class="gff-alert-msg">${a.message}</div>
      </div>
    `).join('');
  }

  private renderController(ctrl: { callsign: string; trustInPlayer: number; frustration: number; currentAssessment: string; lastRecommendation?: string }): string {
    return `
      <div style="font-size:11px;">
        <div class="gff-param-row">
          <span class="gff-param-name">Trust</span>
          <span class="gff-param-value">${(ctrl.trustInPlayer * 100).toFixed(0)}%</span>
        </div>
        <div class="gff-param-row">
          <span class="gff-param-name">Assessment</span>
          <span class="gff-param-value" style="color:${ctrl.currentAssessment === 'go' ? 'var(--green)' : 'var(--red)'};">
            ${ctrl.currentAssessment.toUpperCase()}
          </span>
        </div>
        ${ctrl.lastRecommendation ? `
          <div style="margin-top:4px;font-size:10px;color:var(--text-primary);font-style:italic;">
            "${ctrl.lastRecommendation}"
          </div>
        ` : ''}
      </div>
    `;
  }

  private renderTrends(history: Map<string, Array<{ time: number; value: number }>>): string {
    const entries = Array.from(history.entries());
    if (entries.length === 0) {
      return '<div style="color:var(--text-dim);font-size:10px;">No history data</div>';
    }

    // Show ASCII-style sparkline for each tracked parameter
    return entries.slice(0, 6).map(([name, points]) => {
      const recent = points.slice(-30);
      if (recent.length < 2) return '';

      const min = Math.min(...recent.map(p => p.value));
      const max = Math.max(...recent.map(p => p.value));
      const range = max - min || 1;

      const sparkChars = '▁▂▃▄▅▆▇█';
      const sparkline = recent.map(p => {
        const normalized = (p.value - min) / range;
        const idx = Math.min(sparkChars.length - 1, Math.floor(normalized * sparkChars.length));
        return sparkChars[idx];
      }).join('');

      const current = recent[recent.length - 1].value;

      return `
        <div style="margin-bottom:4px;">
          <div style="display:flex;justify-content:space-between;font-size:10px;">
            <span style="color:var(--text-dim);">${name}</span>
            <span style="color:var(--text-primary);">${current.toFixed(2)}</span>
          </div>
          <div style="font-size:11px;color:var(--cyan);letter-spacing:1px;">${sparkline}</div>
        </div>
      `;
    }).join('');
  }

  private getParamClass(value: number, range?: ValueRange): string {
    if (!range) return '';
    if ((range.warningMax !== undefined && value > range.warningMax) ||
        (range.warningMin !== undefined && value < range.warningMin)) return 'gff-warning';
    if ((range.cautionMax !== undefined && value > range.cautionMax) ||
        (range.cautionMin !== undefined && value < range.cautionMin)) return 'gff-caution';
    if ((range.nominalMax !== undefined && value > range.nominalMax) ||
        (range.nominalMin !== undefined && value < range.nominalMin)) return 'gff-caution';
    return 'gff-nominal';
  }
}
