/**
 * Orbit Panel — center wall screen.
 * SVG orbital visualization with spacecraft position, altitude, velocity readouts.
 */

import { RendererDependencies } from '../Renderer.js';
import { MissionPhase, Subsystem } from '../../types/common.js';

export class OrbitPanel {
  private deps: RendererDependencies;

  constructor(deps: RendererDependencies) {
    this.deps = deps;
  }

  render(container: HTMLElement): void {
    const phase = this.deps.mission.getCurrentPhase();
    const met = this.deps.time.getMET();
    const gnc = this.deps.simulation.getSubsystem(Subsystem.GNC);
    const prop = this.deps.simulation.getSubsystem(Subsystem.Propulsion);

    const deviation = gnc?.getParameter('deviationFromPlanKm') ?? 0;
    const confidence = gnc?.getParameter('sensorConfidence') ?? 1;
    const controlStable = gnc?.getParameter('controlStable') ?? 1;
    const engineActive = (prop?.getParameter('thrustOutput') ?? 0) > 0;

    // Spacecraft position on orbit (animate based on MET)
    const orbitPeriod = 5400; // 90 min in seconds
    const orbitAngle = ((met % orbitPeriod) / orbitPeriod) * 360 - 90;
    const orbitRad = (orbitAngle * Math.PI) / 180;

    // Orbit ellipse dimensions
    const cx = 200, cy = 120;
    const rx = 140, ry = 80;

    // Spacecraft position
    const scX = cx + rx * Math.cos(orbitRad);
    const scY = cy + ry * Math.sin(orbitRad);

    // Earth
    const earthR = 35;

    // Day/night terminator (shifts with mission time)
    const terminatorAngle = ((met % 86400) / 86400) * 360;

    // Status color
    const deviationColor = deviation < 1 ? '#2563EB' : deviation < 5 ? '#F59E0B' : '#EF4444';
    const confColor = confidence > 0.9 ? '#2563EB' : confidence > 0.7 ? '#F59E0B' : '#EF4444';

    container.innerHTML = `
      <div class="mcc-wall-header">TRAJECTORY</div>
      <div class="mcc-orbit-content">
        <svg viewBox="0 0 400 240" class="mcc-orbit-svg">
          <!-- Stars background -->
          ${this.renderStars()}

          <!-- Earth -->
          <circle cx="${cx}" cy="${cy}" r="${earthR}" fill="#1E40AF"/>
          <circle cx="${cx}" cy="${cy}" r="${earthR}" fill="none" stroke="#3B82F6" stroke-width="0.5"/>
          <!-- Earth atmosphere glow -->
          <circle cx="${cx}" cy="${cy}" r="${earthR + 3}" fill="none" stroke="rgba(59,130,246,0.2)" stroke-width="3"/>

          <!-- Orbit path -->
          <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="#64748B" stroke-width="0.8" stroke-dasharray="4,3"/>

          <!-- Planned orbit (solid where ahead of spacecraft) -->
          <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="#3B82F6" stroke-width="1.5" stroke-dasharray="${rx * 3.14}" stroke-dashoffset="${-rx * 3.14 * (orbitAngle + 90) / 360}" opacity="0.4"/>

          <!-- Spacecraft marker -->
          <g transform="translate(${scX},${scY})">
            ${engineActive ? `<circle r="8" fill="none" stroke="#F97316" stroke-width="1" opacity="0.5"><animate attributeName="r" values="6;12;6" dur="1s" repeatCount="indefinite"/></circle>` : ''}
            <polygon points="0,-5 4,3 -4,3" fill="${controlStable ? '#FFFFFF' : '#EF4444'}" stroke="#1E293B" stroke-width="0.5" transform="rotate(${orbitAngle + 90})"/>
            ${engineActive ? `<circle r="2" fill="#F97316" opacity="0.8"/>` : ''}
          </g>

          <!-- Phase label -->
          <text x="${cx}" y="18" text-anchor="middle" fill="#94A3B8" font-size="10" font-family="-apple-system,sans-serif">${phase?.toUpperCase().replace('_', ' ') ?? 'STANDBY'}</text>
        </svg>

        <!-- Readouts -->
        <div class="mcc-orbit-readouts">
          <div class="mcc-orbit-readout">
            <span class="mcc-readout-label">DEVIATION</span>
            <span class="mcc-readout-value" style="color:${deviationColor};">${deviation.toFixed(2)} km</span>
          </div>
          <div class="mcc-orbit-readout">
            <span class="mcc-readout-label">NAV CONF</span>
            <span class="mcc-readout-value" style="color:${confColor};">${(confidence * 100).toFixed(1)}%</span>
          </div>
          <div class="mcc-orbit-readout">
            <span class="mcc-readout-label">CONTROL</span>
            <span class="mcc-readout-value" style="color:${controlStable ? '#2563EB' : '#EF4444'};">${controlStable ? 'STABLE' : 'UNSTABLE'}</span>
          </div>
          <div class="mcc-orbit-readout">
            <span class="mcc-readout-label">ENGINE</span>
            <span class="mcc-readout-value" style="color:${engineActive ? '#F97316' : '#64748B'};">${engineActive ? 'FIRING' : 'OFF'}</span>
          </div>
        </div>
      </div>
    `;
  }

  private renderStars(): string {
    // Deterministic "random" stars
    let stars = '';
    for (let i = 0; i < 40; i++) {
      const x = ((i * 137.508) % 400);
      const y = ((i * 73.357) % 240);
      const r = 0.3 + (i % 3) * 0.3;
      stars += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="#CBD5E1" opacity="${0.3 + (i % 4) * 0.15}"/>`;
    }
    return stars;
  }
}
