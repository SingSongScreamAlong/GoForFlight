/**
 * Telemetry Panel — left wall screen.
 * Subsystem cards with arc gauges showing key parameters.
 */

import { RendererDependencies } from '../Renderer.js';
import { Subsystem, Status } from '../../types/common.js';
import { GaugeWidget } from '../widgets/GaugeWidget.js';
import { StatusDot } from '../widgets/StatusDot.js';

/** Which parameters to show as gauges for each subsystem. */
const SUBSYSTEM_GAUGES: Record<string, Array<{ param: string; label: string; unit?: string; min: number; max: number }>> = {
  [Subsystem.Propulsion]: [
    { param: 'fuelRemaining', label: 'FUEL', unit: '%', min: 0, max: 1 },
    { param: 'oxRemaining', label: 'OX', unit: '%', min: 0, max: 1 },
    { param: 'chamberPressure', label: 'CHAM', unit: 'kPa', min: 0, max: 4000 },
  ],
  [Subsystem.Power]: [
    { param: 'busVoltage', label: 'BUS V', unit: 'V', min: 20, max: 35 },
    { param: 'avgBatteryCharge', label: 'BAT', unit: '%', min: 0, max: 1 },
    { param: 'totalLoadWatts', label: 'LOAD', unit: 'W', min: 0, max: 5000 },
  ],
  [Subsystem.Thermal]: [
    { param: 'cabinTemp', label: 'CABIN', unit: '°C', min: 0, max: 50 },
    { param: 'avionicsTemp', label: 'AVNCS', unit: '°C', min: 10, max: 70 },
    { param: 'radiatorEfficiency', label: 'RAD', unit: '%', min: 0, max: 1 },
  ],
  [Subsystem.ECLSS]: [
    { param: 'oxygenPercent', label: 'O₂', unit: '%', min: 15, max: 25 },
    { param: 'co2Ppm', label: 'CO₂', unit: 'ppm', min: 0, max: 5000 },
    { param: 'cabinPressureKpa', label: 'PRESS', unit: 'kPa', min: 80, max: 110 },
  ],
  [Subsystem.Communications]: [
    { param: 'signalStrength', label: 'SIGNAL', min: 0, max: 1 },
    { param: 'bandwidthKbps', label: 'BW', unit: 'kb/s', min: 0, max: 4096 },
  ],
  [Subsystem.GNC]: [
    { param: 'sensorConfidence', label: 'NAV', min: 0, max: 1 },
    { param: 'deviationFromPlanKm', label: 'DEV', unit: 'km', min: 0, max: 50 },
    { param: 'controlAuthority', label: 'CTRL', min: 0, max: 1 },
  ],
  [Subsystem.Structures]: [
    { param: 'hullIntegrity', label: 'HULL', min: 0, max: 1 },
    { param: 'sealIntegrity', label: 'SEAL', min: 0, max: 1 },
  ],
  [Subsystem.Crew]: [
    { param: 'avgFatigue', label: 'FATIG', min: 0, max: 1 },
    { param: 'avgStress', label: 'STRESS', min: 0, max: 1 },
    { param: 'avgPerformance', label: 'PERF', min: 0, max: 1 },
  ],
};

const SUBSYSTEM_LABELS: Record<string, string> = {
  [Subsystem.Propulsion]: 'PROP',
  [Subsystem.Power]: 'EGIL',
  [Subsystem.Thermal]: 'THERMAL',
  [Subsystem.ECLSS]: 'ECLSS',
  [Subsystem.Communications]: 'INCO',
  [Subsystem.GNC]: 'GNC',
  [Subsystem.Structures]: 'STRUCT',
  [Subsystem.Crew]: 'CREW',
};

export class TelemetryPanel {
  private deps: RendererDependencies;

  constructor(deps: RendererDependencies) {
    this.deps = deps;
  }

  render(container: HTMLElement): void {
    const subsystems = Object.values(Subsystem);

    const cards = subsystems.map(sub => {
      const sim = this.deps.simulation.getSubsystem(sub);
      if (!sim) return '';
      const state = sim.getState();
      const gaugeConfigs = SUBSYSTEM_GAUGES[sub] ?? [];

      const gauges = gaugeConfigs.map(gc => {
        const value = state.parameters.get(gc.param) ?? 0;
        const range = state.nominalRanges.get(gc.param);
        return GaugeWidget.render({
          value,
          min: gc.min,
          max: gc.max,
          range,
          label: gc.label,
          unit: gc.unit,
          size: 48,
          decimals: gc.max <= 1 ? 2 : 0,
        });
      }).join('');

      return `
        <div class="mcc-subsystem-card mcc-status-border-${state.status}" data-subsystem="${sub}">
          <div class="mcc-card-header">
            ${StatusDot.render(state.status, 6)}
            <span class="mcc-card-name">${SUBSYSTEM_LABELS[sub] ?? sub.toUpperCase()}</span>
            <span class="mcc-card-status">${state.status.toUpperCase()}</span>
          </div>
          <div class="mcc-card-gauges">${gauges}</div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="mcc-wall-header">TELEMETRY</div>
      <div class="mcc-telemetry-grid">${cards}</div>
    `;
  }
}
