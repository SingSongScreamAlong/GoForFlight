/**
 * Horizontal Bar Gauge — for resources, trust, percentages.
 */

export interface BarGaugeOptions {
  value: number;       // 0-1 fraction
  label: string;
  width?: number;      // px, default 120
  thresholds?: { caution?: number; warning?: number; critical?: number };
  showPercent?: boolean;
}

export class BarGauge {
  static render(opts: BarGaugeOptions): string {
    const width = opts.width ?? 120;
    const pct = Math.max(0, Math.min(100, opts.value * 100));
    const color = BarGauge.getColor(opts.value, opts.thresholds);

    return `
      <div class="mcc-bar-gauge" style="width:${width}px;">
        <div class="mcc-bar-label">
          <span>${opts.label}</span>
          ${opts.showPercent !== false ? `<span style="color:${color};font-weight:600;">${pct.toFixed(0)}%</span>` : ''}
        </div>
        <div class="mcc-bar-track">
          <div class="mcc-bar-fill" style="width:${pct}%;background:${color};"></div>
        </div>
      </div>
    `;
  }

  private static getColor(value: number, thresholds?: { caution?: number; warning?: number; critical?: number }): string {
    if (!thresholds) return '#2563EB';
    if (thresholds.critical !== undefined && value <= thresholds.critical) return '#EF4444';
    if (thresholds.warning !== undefined && value <= thresholds.warning) return '#F97316';
    if (thresholds.caution !== undefined && value <= thresholds.caution) return '#F59E0B';
    return '#2563EB';
  }
}
