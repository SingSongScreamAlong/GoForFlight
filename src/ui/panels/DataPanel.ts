/**
 * Data Panel — far-left wall screen.
 *
 * Matches real MCC: dark background, dense monospace text tables.
 * Shows: Comm status, GO/CMD readiness, subsystem parameters as
 * text rows, mission timeline, vehicle config state.
 *
 * This is an ops terminal, not a dashboard with gauges.
 */

import { RendererDependencies } from '../Renderer.js';
import { Subsystem, Status, MissionPhase } from '../../types/common.js';

/** Color for a parameter value based on status. */
function valueColor(value: number, nominal?: { min?: number; max?: number }, caution?: { min?: number; max?: number }, warning?: { min?: number; max?: number }): string {
  if (warning) {
    if ((warning.max !== undefined && value > warning.max) || (warning.min !== undefined && value < warning.min)) return '#EF4444';
  }
  if (caution) {
    if ((caution.max !== undefined && value > caution.max) || (caution.min !== undefined && value < caution.min)) return '#F59E0B';
  }
  if (nominal) {
    if ((nominal.max !== undefined && value > nominal.max) || (nominal.min !== undefined && value < nominal.min)) return '#F59E0B';
  }
  return '#4ADE80'; // green for nominal
}

/** Format a number for display. */
function fmt(v: number, decimals = 2): string {
  return v.toFixed(decimals).padStart(8);
}

export class DataPanel {
  private deps: RendererDependencies;

  constructor(deps: RendererDependencies) {
    this.deps = deps;
  }

  render(container: HTMLElement): void {
    const met = this.deps.time.getFormattedMET();
    const phase = this.deps.mission.getCurrentPhase() ?? 'STANDBY';
    const comms = this.deps.simulation.getSubsystem(Subsystem.Communications);
    const signalLocked = (comms?.getParameter('signalLocked') ?? 1) > 0.5;
    const signalStr = comms?.getParameter('signalStrength') ?? 0;

    container.innerHTML = `
      <div class="dp-panel">
        <!-- Comm Sentry -->
        <div class="dp-section">
          <div class="dp-section-title">Comm Sentry</div>
          <div class="dp-row">
            <span class="dp-label">Status</span>
            <span class="dp-value" style="color:${signalLocked ? '#4ADE80' : '#EF4444'};">${signalLocked ? 'TLM AOS' : 'TLM LOS'}</span>
          </div>
          <div class="dp-row">
            <span class="dp-label">Signal</span>
            <span class="dp-value" style="color:${signalStr > 0.7 ? '#4ADE80' : signalStr > 0.4 ? '#F59E0B' : '#EF4444'};">${(signalStr * 100).toFixed(1)}%</span>
          </div>
          <div class="dp-row">
            <span class="dp-label">Bandwidth</span>
            <span class="dp-value">${comms?.getParameter('bandwidthKbps')?.toFixed(0) ?? '—'} kbps</span>
          </div>
          <div class="dp-row">
            <span class="dp-label">Delay</span>
            <span class="dp-value">${comms?.getParameter('delaySeconds')?.toFixed(2) ?? '—'} s</span>
          </div>
        </div>

        <!-- Go Cmd -->
        <div class="dp-section">
          <div class="dp-go-cmd">
            <span class="dp-go-indicator" style="background:${signalLocked ? '#22C55E' : '#EF4444'};">${signalLocked ? 'Go Cmd' : 'No Cmd'}</span>
          </div>
        </div>

        <!-- Mission Timeline -->
        <div class="dp-section">
          <div class="dp-section-title">Mission</div>
          <div class="dp-row">
            <span class="dp-label">MET</span>
            <span class="dp-value dp-highlight">${met}</span>
          </div>
          <div class="dp-row">
            <span class="dp-label">Phase</span>
            <span class="dp-value">${String(phase).replace('_', ' ')}</span>
          </div>
          <div class="dp-row">
            <span class="dp-label">Time Scale</span>
            <span class="dp-value">${this.deps.time.getTimeScale()}x</span>
          </div>
        </div>

        <!-- Subsystem Status Table -->
        <div class="dp-section">
          <div class="dp-section-title">Systems Status</div>
          ${this.renderSubsystemTable()}
        </div>

        <!-- Key Parameters -->
        <div class="dp-section">
          <div class="dp-section-title">Key Parameters</div>
          ${this.renderKeyParams()}
        </div>

        <!-- Resources -->
        <div class="dp-section">
          <div class="dp-section-title">Resources</div>
          ${this.renderResources()}
        </div>
      </div>
    `;
  }

  private renderSubsystemTable(): string {
    const subsystems: Array<{ id: Subsystem; label: string }> = [
      { id: Subsystem.Propulsion, label: 'PROP' },
      { id: Subsystem.Power, label: 'EGIL' },
      { id: Subsystem.Thermal, label: 'THERM' },
      { id: Subsystem.ECLSS, label: 'ECLSS' },
      { id: Subsystem.Communications, label: 'INCO' },
      { id: Subsystem.GNC, label: 'GNC' },
      { id: Subsystem.Structures, label: 'STRUC' },
      { id: Subsystem.Crew, label: 'CREW' },
    ];

    return subsystems.map(s => {
      const sim = this.deps.simulation.getSubsystem(s.id);
      const status = sim?.getState().status ?? Status.Unknown;
      const color = status === Status.Nominal ? '#4ADE80' :
                    status === Status.Advisory ? '#60A5FA' :
                    status === Status.Caution ? '#F59E0B' :
                    status === Status.Warning ? '#F97316' :
                    status === Status.Critical || status === Status.Failed ? '#EF4444' : '#94A3B8';
      return `<div class="dp-status-row" data-subsystem="${s.id}">
        <span class="dp-status-dot" style="background:${color};"></span>
        <span class="dp-status-label">${s.label}</span>
        <span class="dp-status-value" style="color:${color};">${status.toUpperCase()}</span>
      </div>`;
    }).join('');
  }

  private renderKeyParams(): string {
    const rows: Array<{ label: string; value: string; color: string }> = [];

    const prop = this.deps.simulation.getSubsystem(Subsystem.Propulsion);
    const power = this.deps.simulation.getSubsystem(Subsystem.Power);
    const eclss = this.deps.simulation.getSubsystem(Subsystem.ECLSS);
    const gnc = this.deps.simulation.getSubsystem(Subsystem.GNC);
    const thermal = this.deps.simulation.getSubsystem(Subsystem.Thermal);

    const v = (sub: any, param: string) => sub?.getParameter(param) ?? 0;

    rows.push({ label: 'Bus Voltage', value: `${v(power, 'busVoltage').toFixed(1)} V`, color: valueColor(v(power, 'busVoltage'), { min: 27, max: 30 }, { min: 25 }, { min: 23 }) });
    rows.push({ label: 'O₂ Level', value: `${v(eclss, 'oxygenPercent').toFixed(1)} %`, color: valueColor(v(eclss, 'oxygenPercent'), { min: 19.5, max: 23.5 }, { min: 18.5 }, { min: 17 }) });
    rows.push({ label: 'CO₂', value: `${v(eclss, 'co2Ppm').toFixed(0)} ppm`, color: valueColor(v(eclss, 'co2Ppm'), undefined, { max: 2500 }, { max: 5000 }) });
    rows.push({ label: 'Cabin Press', value: `${v(eclss, 'cabinPressureKpa').toFixed(1)} kPa`, color: valueColor(v(eclss, 'cabinPressureKpa'), { min: 98, max: 104 }, { min: 90 }, { min: 80 }) });
    rows.push({ label: 'Cabin Temp', value: `${v(thermal, 'cabinTemp').toFixed(1)} °C`, color: valueColor(v(thermal, 'cabinTemp'), { min: 18, max: 27 }, { min: 10, max: 35 }) });
    rows.push({ label: 'Nav Conf', value: `${(v(gnc, 'sensorConfidence') * 100).toFixed(1)} %`, color: valueColor(v(gnc, 'sensorConfidence'), { min: 0.9 }, { min: 0.75 }, { min: 0.5 }) });
    rows.push({ label: 'Deviation', value: `${v(gnc, 'deviationFromPlanKm').toFixed(2)} km`, color: valueColor(v(gnc, 'deviationFromPlanKm'), { max: 1 }, { max: 5 }, { max: 20 }) });
    rows.push({ label: 'Cham Press', value: `${v(prop, 'chamberPressure').toFixed(0)} kPa`, color: v(prop, 'chamberPressure') > 0 ? '#F97316' : '#94A3B8' });

    return rows.map(r =>
      `<div class="dp-row"><span class="dp-label">${r.label}</span><span class="dp-value" style="color:${r.color};">${r.value}</span></div>`
    ).join('');
  }

  private renderResources(): string {
    const prop = this.deps.simulation.getSubsystem(Subsystem.Propulsion);
    const power = this.deps.simulation.getSubsystem(Subsystem.Power);
    const eclss = this.deps.simulation.getSubsystem(Subsystem.ECLSS);

    const resources = [
      { label: 'Fuel', value: (prop?.getParameter('fuelRemaining') ?? 1), },
      { label: 'Oxidizer', value: (prop?.getParameter('oxRemaining') ?? 1) },
      { label: 'Battery', value: (power?.getParameter('avgBatteryCharge') ?? 1) },
      { label: 'O₂ Reserve', value: (eclss?.getParameter('o2ReserveKg') ?? 100) / 100 },
      { label: 'Water', value: (eclss?.getParameter('waterReserveKg') ?? 50) / 50 },
    ];

    return resources.map(r => {
      const pct = Math.max(0, Math.min(100, r.value * 100));
      const color = pct > 30 ? '#4ADE80' : pct > 15 ? '#F59E0B' : '#EF4444';
      const barWidth = Math.round(pct / 2); // max 50 chars wide
      const bar = '█'.repeat(barWidth) + '░'.repeat(50 - barWidth);
      return `<div class="dp-row">
        <span class="dp-label">${r.label}</span>
        <span class="dp-value" style="color:${color};">${pct.toFixed(0).padStart(4)}%</span>
      </div>
      <div class="dp-bar" style="color:${color};">${bar}</div>`;
    }).join('');
  }
}
