/**
 * SVG Arc Gauge Widget — NASA MCC style.
 *
 * A 240-degree arc with color-banded zones from ValueRange thresholds.
 * Needle indicates current value. Numeric readout below.
 *
 * All static methods returning SVG markup strings.
 */

import { ValueRange, Status } from '../../types/common.js';

export interface GaugeOptions {
  value: number;
  min: number;
  max: number;
  range?: ValueRange;
  label: string;
  unit?: string;
  size?: number;       // diameter in px, default 64
  decimals?: number;   // decimal places for readout
}

export class GaugeWidget {
  /**
   * Render an SVG arc gauge as an HTML string.
   */
  static render(opts: GaugeOptions): string {
    const size = opts.size ?? 64;
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 6;
    const strokeWidth = 5;

    // Arc goes from 150° to 390° (240° sweep, gap at bottom)
    const startAngle = 150;
    const endAngle = 390;
    const sweep = endAngle - startAngle;

    const valueFrac = Math.max(0, Math.min(1, (opts.value - opts.min) / (opts.max - opts.min || 1)));
    const needleAngle = startAngle + valueFrac * sweep;

    // Determine value color
    const color = opts.range ? GaugeWidget.getStatusColor(opts.value, opts.range) : '#2563EB';

    // Build arc segments
    let arcs = '';
    if (opts.range) {
      arcs = GaugeWidget.buildRangeArcs(opts.range, opts.min, opts.max, cx, cy, r, strokeWidth, startAngle, sweep);
    } else {
      // Simple single-color arc
      arcs = GaugeWidget.arcPath(cx, cy, r, startAngle, endAngle, '#CBD5E1', strokeWidth);
      arcs += GaugeWidget.arcPath(cx, cy, r, startAngle, startAngle + valueFrac * sweep, '#2563EB', strokeWidth);
    }

    // Needle
    const needleLen = r - 2;
    const nx = cx + needleLen * Math.cos((needleAngle * Math.PI) / 180);
    const ny = cy + needleLen * Math.sin((needleAngle * Math.PI) / 180);

    // Tick marks at 0%, 50%, 100%
    const ticks = [0, 0.5, 1].map(f => {
      const a = startAngle + f * sweep;
      const outerR = r + 2;
      const innerR = r - 2;
      const x1 = cx + outerR * Math.cos((a * Math.PI) / 180);
      const y1 = cy + outerR * Math.sin((a * Math.PI) / 180);
      const x2 = cx + innerR * Math.cos((a * Math.PI) / 180);
      const y2 = cy + innerR * Math.sin((a * Math.PI) / 180);
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#94A3B8" stroke-width="1"/>`;
    }).join('');

    const displayValue = opts.decimals !== undefined ? opts.value.toFixed(opts.decimals) : opts.value.toFixed(1);
    const labelSize = Math.max(6, size / 10);
    const valueSize = Math.max(8, size / 7);

    return `
      <svg width="${size}" height="${size + 16}" viewBox="0 0 ${size} ${size + 16}" class="mcc-gauge">
        <!-- Background arc -->
        ${GaugeWidget.arcPath(cx, cy, r, startAngle, endAngle, '#E2E8F0', strokeWidth)}
        <!-- Range arcs -->
        ${arcs}
        <!-- Ticks -->
        ${ticks}
        <!-- Needle -->
        <line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        <circle cx="${cx}" cy="${cy}" r="2.5" fill="${color}"/>
        <!-- Value readout -->
        <text x="${cx}" y="${cy + r * 0.45}" text-anchor="middle" fill="${color}" font-size="${valueSize}" font-weight="bold" font-family="'Consolas','Courier New',monospace">${displayValue}</text>
        <!-- Label -->
        <text x="${cx}" y="${size + 12}" text-anchor="middle" fill="#64748B" font-size="${labelSize}" font-family="-apple-system,sans-serif">${opts.label}${opts.unit ? ' ' + opts.unit : ''}</text>
      </svg>
    `;
  }

  static getStatusColor(value: number, range: ValueRange): string {
    if ((range.warningMax !== undefined && value > range.warningMax) ||
        (range.warningMin !== undefined && value < range.warningMin)) return '#EF4444';
    if ((range.cautionMax !== undefined && value > range.cautionMax) ||
        (range.cautionMin !== undefined && value < range.cautionMin)) return '#F97316';
    if ((range.nominalMax !== undefined && value > range.nominalMax) ||
        (range.nominalMin !== undefined && value < range.nominalMin)) return '#F59E0B';
    return '#2563EB';
  }

  private static buildRangeArcs(
    range: ValueRange, min: number, max: number,
    cx: number, cy: number, r: number, sw: number,
    startAngle: number, sweep: number,
  ): string {
    const span = max - min || 1;
    const toAngle = (v: number) => startAngle + ((v - min) / span) * sweep;

    let arcs = '';
    // Draw zones from outermost (critical) to innermost (nominal) so they layer correctly
    const zones: Array<{ from: number; to: number; color: string }> = [];

    // Full range = red (critical zone)
    zones.push({ from: min, to: max, color: '#FEE2E2' });

    // Warning zones
    if (range.warningMin !== undefined) zones.push({ from: range.warningMin, to: max, color: '#FFEDD5' });
    if (range.warningMax !== undefined) zones.push({ from: min, to: range.warningMax, color: '#FFEDD5' });

    // Caution zones
    if (range.cautionMin !== undefined) zones.push({ from: range.cautionMin, to: range.cautionMax ?? max, color: '#FEF3C7' });

    // Nominal zone
    if (range.nominalMin !== undefined && range.nominalMax !== undefined) {
      zones.push({ from: range.nominalMin, to: range.nominalMax, color: '#DBEAFE' });
    }

    for (const zone of zones) {
      const a1 = toAngle(Math.max(zone.from, min));
      const a2 = toAngle(Math.min(zone.to, max));
      arcs += GaugeWidget.arcPath(cx, cy, r, a1, a2, zone.color, sw);
    }

    return arcs;
  }

  private static arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number, color: string, strokeWidth: number): string {
    const startRad = (startDeg * Math.PI) / 180;
    const endRad = (endDeg * Math.PI) / 180;
    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy + r * Math.sin(endRad);
    const largeArc = (endDeg - startDeg) > 180 ? 1 : 0;
    return `<path d="M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round"/>`;
  }
}
