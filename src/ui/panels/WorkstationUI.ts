/**
 * Workstation UI — the right-side panel where the player works.
 *
 * Contains: alert stack, command console, procedure tabs,
 * dialogue transcript, context panel.
 */

import { RendererDependencies } from '../Renderer.js';
import { Severity } from '../../types/common.js';

export class WorkstationUI {
  private deps: RendererDependencies;
  private activeTab: 'alerts' | 'commands' | 'procedures' | 'transcript' = 'alerts';

  constructor(deps: RendererDependencies) {
    this.deps = deps;
  }

  render(container: HTMLElement): void {
    const tabs = this.renderTabs();
    const content = this.renderTabContent();

    container.innerHTML = `${tabs}${content}`;

    // Wire tab clicks
    container.querySelectorAll('.gff-ws-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.activeTab = tab.getAttribute('data-tab') as any;
      });
    });
  }

  private renderTabs(): string {
    const tabs = [
      { id: 'alerts', label: 'ALERTS', badge: this.deps.alerts.getUnacknowledged().length },
      { id: 'commands', label: 'COMMANDS', badge: 0 },
      { id: 'procedures', label: 'PROCEDURES', badge: this.deps.procedures.getActive().length },
      { id: 'transcript', label: 'TRANSCRIPT', badge: 0 },
    ];

    return `<div style="display:flex;gap:2px;margin-bottom:8px;">
      ${tabs.map(t => `
        <div class="gff-ws-tab ${t.id === this.activeTab ? 'gff-ws-tab-active' : ''}" data-tab="${t.id}"
             style="flex:1;text-align:center;padding:4px;font-size:9px;letter-spacing:1px;cursor:pointer;
                    background:${t.id === this.activeTab ? 'var(--bg-panel)' : 'var(--bg-secondary)'};
                    color:${t.id === this.activeTab ? 'var(--cyan)' : 'var(--text-dim)'};
                    border:1px solid var(--border);border-bottom:${t.id === this.activeTab ? 'none' : '1px solid var(--border)'};">
          ${t.label}${t.badge > 0 ? ` (${t.badge})` : ''}
        </div>
      `).join('')}
    </div>`;
  }

  private renderTabContent(): string {
    switch (this.activeTab) {
      case 'alerts': return this.renderAlerts();
      case 'commands': return this.renderCommands();
      case 'procedures': return this.renderProcedures();
      case 'transcript': return this.renderTranscript();
    }
  }

  private renderAlerts(): string {
    const alerts = this.deps.alerts.getActive();
    if (alerts.length === 0) {
      return '<div style="color:var(--green);font-size:11px;padding:8px;">ALL NOMINAL — NO ACTIVE ALERTS</div>';
    }

    return alerts.map(alert => {
      const sevClass = `gff-sev-${alert.severity}`;
      const timeAgo = this.deps.time.getMET() - alert.createdAt;
      return `
        <div class="gff-alert-item ${sevClass}" data-alert-id="${alert.id}">
          <div class="gff-alert-msg">[${alert.severity.toUpperCase()}] ${alert.message}</div>
          <div class="gff-alert-meta">
            ${alert.subsystem.toUpperCase()} | ${timeAgo.toFixed(0)}s ago
            ${alert.acknowledged ? ' | ACK' : ''}
            ${alert.escalationCount > 0 ? ` | ESC ×${alert.escalationCount}` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  private renderCommands(): string {
    const categories = ['authority', 'system', 'crew', 'strategy'] as const;

    return categories.map(cat => {
      const cmds = this.deps.commands.getAvailableCommands(cat);
      return `
        <div class="gff-section-header">${cat.toUpperCase()}</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;">
          ${cmds.map(cmd => {
            const onCooldown = this.deps.commands.isOnCooldown(cmd.id);
            const isDanger = cmd.id === 'cmd_abort' || cmd.id === 'cmd_scrub';
            return `<button class="gff-cmd-btn ${isDanger ? 'gff-cmd-danger' : ''}"
                            ${onCooldown ? 'disabled' : ''}
                            data-cmd="${cmd.id}"
                            title="${cmd.description}">
              ${cmd.name}
            </button>`;
          }).join('')}
        </div>
      `;
    }).join('');
  }

  private renderProcedures(): string {
    const active = this.deps.procedures.getActive();

    if (active.length === 0) {
      return '<div style="color:var(--text-dim);font-size:11px;padding:8px;">NO ACTIVE PROCEDURES</div>';
    }

    return active.map(({ definition, state }) => {
      const steps = this.deps.procedures.getStepStatuses(definition.id);

      return `
        <div style="margin-bottom:12px;">
          <div class="gff-section-header">${definition.name} [${definition.category.toUpperCase()}]</div>
          ${steps.map(({ step, status }) => `
            <div class="gff-proc-step gff-step-${status}">
              <span style="color:var(--text-dim);font-size:9px;">${step.index + 1}.</span>
              ${step.instruction}
              ${status === 'current' && step.requiresConfirmation ? '<span style="color:var(--cyan);"> [CONFIRM]</span>' : ''}
              ${step.warningNote ? `<div style="color:var(--orange);font-size:9px;">⚠ ${step.warningNote}</div>` : ''}
            </div>
          `).join('')}
        </div>
      `;
    }).join('');
  }

  private renderTranscript(): string {
    const history = this.deps.dialogue.getHistory(30);

    if (history.length === 0) {
      return '<div style="color:var(--text-dim);font-size:11px;padding:8px;">NO DIALOGUE YET</div>';
    }

    return `<div style="display:flex;flex-direction:column;gap:4px;">
      ${history.map(line => `
        <div style="font-size:11px;padding:4px 0;border-bottom:1px solid rgba(42,42,58,0.3);">
          <span style="color:var(--cyan);font-weight:bold;">${line.callsign}:</span>
          <span style="color:var(--text-primary);">${line.text}</span>
        </div>
      `).join('')}
    </div>`;
  }
}
