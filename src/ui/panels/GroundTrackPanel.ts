/**
 * Ground Track Panel — right wall screen.
 * SVG world map with spacecraft ground track, ground stations, comm coverage.
 */

import { RendererDependencies } from '../Renderer.js';
import { Subsystem } from '../../types/common.js';
import { CONTINENT_PATHS, GROUND_STATIONS } from '../data/WorldMapPath.js';

export class GroundTrackPanel {
  private deps: RendererDependencies;

  constructor(deps: RendererDependencies) {
    this.deps = deps;
  }

  render(container: HTMLElement): void {
    const met = this.deps.time.getMET();
    const comms = this.deps.simulation.getSubsystem(Subsystem.Communications);
    const signalStrength = comms?.getParameter('signalStrength') ?? 0;
    const inBlackout = (comms?.getParameter('inBlackout') ?? 0) > 0.5;
    const signalLocked = (comms?.getParameter('signalLocked') ?? 1) > 0.5;

    // Generate ground track (sinusoidal for LEO)
    const orbitPeriod = 5400;
    const inclination = 51.6; // ISS-like inclination
    const groundTrack = this.computeGroundTrack(met, orbitPeriod, inclination);

    // Current spacecraft position
    const scPos = groundTrack[groundTrack.length - 1] ?? { x: 180, y: 90 };

    // Continents
    const continents = CONTINENT_PATHS.map(d =>
      `<path d="${d}" fill="#64748B" stroke="#94A3B8" stroke-width="0.8" opacity="0.8"/>`
    ).join('');

    // Ground track polyline
    const trackPoints = groundTrack.map(p => `${p.x},${p.y}`).join(' ');

    // Ground stations
    const stations = GROUND_STATIONS.map(gs => {
      const x = gs.lon + 180;
      const y = 90 - gs.lat;
      const inRange = Math.hypot(scPos.x - x, scPos.y - y) < 40;
      return `
        <circle cx="${x}" cy="${y}" r="1.5" fill="${inRange ? '#22C55E' : '#F59E0B'}" stroke="white" stroke-width="0.3"/>
        ${inRange ? `<circle cx="${x}" cy="${y}" r="25" fill="none" stroke="#22C55E" stroke-width="0.4" stroke-dasharray="2,2" opacity="0.4"/>` : ''}
        <text x="${x}" y="${y - 4}" text-anchor="middle" fill="#64748B" font-size="4" font-family="-apple-system,sans-serif">${gs.name}</text>
      `;
    }).join('');

    // Day/night terminator
    const termX = ((met % 86400) / 86400) * 360;

    // Signal indicator
    const signalColor = signalStrength > 0.7 ? '#22C55E' : signalStrength > 0.4 ? '#F59E0B' : '#EF4444';

    container.innerHTML = `
      <div class="mcc-wall-header">GROUND TRACK</div>
      <div class="mcc-map-content">
        <svg viewBox="0 0 360 180" class="mcc-map-svg" preserveAspectRatio="xMidYMid meet">
          <!-- Ocean -->
          <rect x="0" y="0" width="360" height="180" fill="#1E293B"/>

          <!-- Night side -->
          <rect x="${termX}" y="0" width="180" height="180" fill="rgba(0,0,0,0.25)"/>

          <!-- Grid lines -->
          ${this.renderGrid()}

          <!-- Continents -->
          ${continents}

          <!-- Ground track -->
          <polyline points="${trackPoints}" fill="none" stroke="#3B82F6" stroke-width="1" opacity="0.6"/>

          <!-- Ground stations -->
          ${stations}

          <!-- Spacecraft position -->
          <circle cx="${scPos.x}" cy="${scPos.y}" r="3" fill="#FFFFFF" stroke="#2563EB" stroke-width="1"/>
          <circle cx="${scPos.x}" cy="${scPos.y}" r="6" fill="none" stroke="#3B82F6" stroke-width="0.5" opacity="0.5">
            <animate attributeName="r" values="5;8;5" dur="2s" repeatCount="indefinite"/>
          </circle>
        </svg>

        <!-- Comm status -->
        <div class="mcc-map-status">
          <div class="mcc-map-stat">
            <span class="mcc-readout-label">SIGNAL</span>
            <span class="mcc-readout-value" style="color:${signalColor};">${(signalStrength * 100).toFixed(0)}%</span>
          </div>
          <div class="mcc-map-stat">
            <span class="mcc-readout-label">LINK</span>
            <span class="mcc-readout-value" style="color:${signalLocked ? '#22C55E' : '#EF4444'};">${inBlackout ? 'BLACKOUT' : signalLocked ? 'LOCKED' : 'NO LOCK'}</span>
          </div>
        </div>
      </div>
    `;
  }

  private computeGroundTrack(met: number, period: number, inclination: number): Array<{ x: number; y: number }> {
    const points: Array<{ x: number; y: number }> = [];
    const earthRotRate = 360 / 86400; // deg/s
    const orbitRate = 360 / period;

    // Plot last 1.5 orbits of ground track
    const duration = period * 1.5;
    const startTime = Math.max(0, met - duration);

    for (let t = startTime; t <= met; t += period / 60) {
      const orbitAngle = (t * orbitRate) * (Math.PI / 180);
      const lat = inclination * Math.sin(orbitAngle);
      const lon = ((t * (orbitRate - earthRotRate)) % 360) - 180;

      const x = ((lon + 360) % 360);
      const y = 90 - lat;
      points.push({ x, y });
    }

    return points;
  }

  private renderGrid(): string {
    let lines = '';
    // Latitude lines every 30°
    for (let lat = -60; lat <= 60; lat += 30) {
      const y = 90 - lat;
      lines += `<line x1="0" y1="${y}" x2="360" y2="${y}" stroke="#334155" stroke-width="0.3"/>`;
    }
    // Longitude lines every 60°
    for (let lon = -120; lon <= 180; lon += 60) {
      const x = lon + 180;
      lines += `<line x1="${x}" y1="0" x2="${x}" y2="180" stroke="#334155" stroke-width="0.3"/>`;
    }
    // Equator
    lines += `<line x1="0" y1="90" x2="360" y2="90" stroke="#475569" stroke-width="0.4" stroke-dasharray="3,3"/>`;
    return lines;
  }
}
