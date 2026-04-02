/**
 * Controller Detail Panel — expanded view when a controller seat is clicked.
 *
 * Shows: subsystem telemetry, recommendation, available commands,
 * active procedures, trust level, dialogue history.
 */

import { RendererDependencies } from '../Renderer.js';
import { Subsystem, Status, Severity } from '../../types/common.js';
import { ControllerState } from '../../controllers/ControllerFramework.js';
import { GaugeWidget } from '../widgets/GaugeWidget.js';
import { BarGauge } from '../widgets/BarGauge.js';
import { StatusDot } from '../widgets/StatusDot.js';

export class ControllerDetailPanel {
  private deps: RendererDependencies;

  constructor(deps: RendererDependencies) {
    this.deps = deps;
  }

  render(container: HTMLElement, controllerId: string): void {
    const ctrl = this.deps.controllers.getController(controllerId);
    if (!ctrl) {
      container.innerHTML = '<div class="mcc-detail-empty">No controller selected</div>';
      return;
    }

    const sim = this.deps.simulation.getSubsystem(ctrl.subsystem);
    const state = sim?.getState();

    container.innerHTML = `
      <div class="mcc-detail-panel">
        <!-- Header -->
        <div class="mcc-detail-header">
          <div class="mcc-detail-title">
            ${StatusDot.render(state?.status ?? Status.Unknown, 10)}
            <span class="mcc-detail-callsign">${ctrl.callsign}</span>
            <span class="mcc-detail-name">${ctrl.name}</span>
          </div>
          <button class="mcc-btn mcc-btn-back" data-back>← ROOM</button>
        </div>

        <div class="mcc-detail-body">
          <!-- Left: Telemetry -->
          <div class="mcc-detail-telemetry">
            <div class="mcc-detail-section-title">TELEMETRY — ${ctrl.subsystem.toUpperCase()}</div>
            <div class="mcc-detail-gauges">
              ${this.renderSubsystemGauges(ctrl.subsystem, state)}
            </div>
            <div class="mcc-detail-section-title" style="margin-top:12px;">TRUST</div>
            ${BarGauge.render({ value: ctrl.trustInPlayer, label: 'Trust in Flight', width: 200, thresholds: { warning: 0.3, caution: 0.5 } })}
          </div>

          <!-- Right: Actions & Info -->
          <div class="mcc-detail-actions">
            <!-- Recommendation -->
            ${ctrl.lastRecommendation ? `
              <div class="mcc-detail-section-title">RECOMMENDATION</div>
              <div class="mcc-detail-recommendation">${ctrl.lastRecommendation}</div>
            ` : ''}

            <!-- Commands -->
            <div class="mcc-detail-section-title">COMMANDS</div>
            <div class="mcc-detail-commands">
              ${this.renderCommands(ctrl.subsystem)}
            </div>

            <!-- Procedures -->
            <div class="mcc-detail-section-title">PROCEDURES</div>
            <div class="mcc-detail-procedures">
              ${this.renderProcedures(ctrl.subsystem)}
            </div>

            <!-- Dialogue -->
            <div class="mcc-detail-section-title">RECENT DIALOGUE</div>
            <div class="mcc-detail-dialogue">
              ${this.renderDialogue(controllerId)}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderSubsystemGauges(subsystem: Subsystem, state: any): string {
    if (!state) return '<div style="color:#94A3B8;">No data</div>';

    const params: Array<[string, number]> = (Array.from(state.parameters.entries()) as Array<[string, number]>).slice(0, 6);
    return params.map(([name, value]) => {
      const range = state.nominalRanges.get(name);
      return GaugeWidget.render({
        value,
        min: range?.min ?? 0,
        max: range?.max ?? (value * 2 || 1),
        range,
        label: name.replace(/([A-Z])/g, ' $1').trim().substring(0, 8).toUpperCase(),
        size: 70,
        decimals: value <= 1 ? 2 : 0,
      });
    }).join('');
  }

  private renderCommands(subsystem: Subsystem): string {
    const cmds = [
      ...this.deps.commands.getAvailableCommands('system', subsystem),
      ...this.deps.commands.getAvailableCommands('system', 'mission'),
    ].slice(0, 6);

    if (cmds.length === 0) return '<div style="color:#94A3B8;font-size:11px;">No commands available</div>';

    return cmds.map(cmd => {
      const onCooldown = this.deps.commands.isOnCooldown(cmd.id);
      return `<button class="mcc-btn mcc-btn-cmd" data-cmd="${cmd.id}" ${onCooldown ? 'disabled' : ''} title="${cmd.description}">${cmd.name}</button>`;
    }).join('');
  }

  private renderProcedures(subsystem: Subsystem): string {
    const procs = this.deps.procedures.getBySubsystem(subsystem);
    const active = this.deps.procedures.getActive();
    const activeIds = new Set(active.map(a => a.definition.id));

    if (procs.length === 0) return '<div style="color:#94A3B8;font-size:11px;">No procedures</div>';

    return procs.map(proc => {
      const isActive = activeIds.has(proc.id);
      return `
        <div class="mcc-detail-proc-item">
          <span>${proc.name}</span>
          ${isActive
            ? '<span style="color:#2563EB;font-size:9px;">RUNNING</span>'
            : `<button class="mcc-btn mcc-btn-small" data-proc-start="${proc.id}">RUN</button>`
          }
        </div>
      `;
    }).join('');
  }

  private renderDialogue(controllerId: string): string {
    const lines = this.deps.dialogue.getHistory(10)
      .filter(l => l.controllerId === controllerId);

    if (lines.length === 0) return '<div style="color:#94A3B8;font-size:11px;">No recent dialogue</div>';

    return lines.slice(-5).map(line => `
      <div class="mcc-detail-dialogue-line">
        <span style="color:#2563EB;font-weight:600;">${line.callsign}:</span>
        <span>${line.text}</span>
      </div>
    `).join('');
  }
}
