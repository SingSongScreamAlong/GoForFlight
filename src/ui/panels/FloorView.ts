/**
 * Floor View — the MCC room with controller seats.
 *
 * Rows of consoles arranged like the real room:
 *   Back row:   BOOSTER  EECOM  GNC
 *   Middle row:  EGIL  THERMAL  INCO
 *   Front row:     CAPCOM  FLIGHT (you)
 *
 * Click a seat to open their detail panel.
 */

import { RendererDependencies } from '../Renderer.js';
import { GoNoGo, Status, Severity } from '../../types/common.js';
import { StatusDot } from '../widgets/StatusDot.js';
import { ControllerState } from '../../controllers/ControllerFramework.js';

/** Seat layout definition. */
const SEAT_ROWS = [
  // Back row (farthest from camera)
  { row: 'back', seats: ['ctrl_booster', 'ctrl_eecom', 'ctrl_gnc'] },
  // Middle row
  { row: 'middle', seats: ['ctrl_electrical', 'ctrl_thermal', 'ctrl_inco'] },
  // Front row (closest, the player's row)
  { row: 'front', seats: ['__capcom', '__flight'] },
];

export class FloorView {
  private deps: RendererDependencies;

  constructor(deps: RendererDependencies) {
    this.deps = deps;
  }

  render(container: HTMLElement): void {
    const allControllers = this.deps.controllers.getAll();
    const ctrlMap = new Map(allControllers.map(c => [c.id, c]));
    const dialogue = this.deps.dialogue.getHistory(1)[0];

    const rows = SEAT_ROWS.map(rowDef => {
      const seats = rowDef.seats.map(seatId => {
        if (seatId === '__capcom') return this.renderCapcomSeat();
        if (seatId === '__flight') return this.renderFlightSeat();
        const ctrl = ctrlMap.get(seatId);
        if (!ctrl) return '';
        return this.renderControllerSeat(ctrl, dialogue?.controllerId === ctrl.id);
      }).join('');

      return `<div class="mcc-room-row mcc-row-${rowDef.row}">${seats}</div>`;
    }).join('');

    container.innerHTML = rows;
  }

  private renderControllerSeat(ctrl: ControllerState, isSpeaking: boolean): string {
    const hasRecommendation = ctrl.lastRecommendation !== undefined &&
      ctrl.currentAssessment !== GoNoGo.Go;

    const sim = this.deps.simulation.getSubsystem(ctrl.subsystem);
    const subsystemStatus = sim?.getState().status ?? Status.Unknown;

    const seatClass = [
      'mcc-controller-seat',
      isSpeaking ? 'mcc-seat-speaking' : '',
      hasRecommendation ? 'mcc-seat-alert' : '',
    ].filter(Boolean).join(' ');

    const voteColor = ctrl.currentAssessment === GoNoGo.Go ? '#22C55E' :
                      ctrl.currentAssessment === GoNoGo.NoGo ? '#EF4444' : '#F59E0B';

    return `
      <div class="${seatClass}" data-controller-id="${ctrl.id}">
        <div class="mcc-seat-header" style="border-top:2px solid ${StatusDot.statusColor(subsystemStatus)};">
          <span class="mcc-seat-callsign">${ctrl.callsign}</span>
          ${hasRecommendation ? '<span class="mcc-seat-badge"></span>' : ''}
        </div>
        <div class="mcc-seat-body">
          <div class="mcc-seat-name">${ctrl.name}</div>
          <div class="mcc-seat-subsystem">${ctrl.subsystem.toUpperCase()}</div>
          <div class="mcc-seat-vote" style="color:${voteColor};">
            <span class="mcc-vote-dot" style="background:${voteColor};"></span>
            ${ctrl.currentAssessment.toUpperCase().replace('_', '-')}
          </div>
        </div>
      </div>
    `;
  }

  private renderCapcomSeat(): string {
    const recentCrewReport = this.deps.dialogue.getHistory(5)
      .find(l => l.type === 'callout' || l.type === 'confirmation');

    return `
      <div class="mcc-controller-seat mcc-seat-capcom">
        <div class="mcc-seat-header" style="border-top:2px solid #3B82F6;">
          <span class="mcc-seat-callsign">CAPCOM</span>
        </div>
        <div class="mcc-seat-body">
          <div class="mcc-seat-name">Crew Link</div>
          <div class="mcc-seat-subsystem">VOICE</div>
          <div class="mcc-seat-vote" style="color:#3B82F6;">
            <span class="mcc-vote-dot" style="background:#3B82F6;"></span>
            ACTIVE
          </div>
        </div>
      </div>
    `;
  }

  private renderFlightSeat(): string {
    const alertCount = this.deps.alerts.getUnacknowledged().length;
    const activeProcCount = this.deps.procedures.getActive().length;

    return `
      <div class="mcc-controller-seat mcc-seat-flight">
        <div class="mcc-seat-header" style="border-top:2px solid #1E40AF;">
          <span class="mcc-seat-callsign">FLIGHT</span>
          <span style="font-size:8px;color:#94A3B8;">YOU</span>
        </div>
        <div class="mcc-seat-body">
          <div class="mcc-seat-name">Flight Director</div>
          ${alertCount > 0 ? `<div style="font-size:9px;color:#F59E0B;">${alertCount} alert${alertCount > 1 ? 's' : ''}</div>` : ''}
          ${activeProcCount > 0 ? `<div style="font-size:9px;color:#3B82F6;">${activeProcCount} procedure${activeProcCount > 1 ? 's' : ''}</div>` : ''}
        </div>
      </div>
    `;
  }
}
