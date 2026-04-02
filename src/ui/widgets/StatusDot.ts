/**
 * Status Dot — color-coded status indicator.
 */

import { Status, GoNoGo } from '../../types/common.js';

export class StatusDot {
  static render(status: Status, size = 8): string {
    const color = StatusDot.statusColor(status);
    const pulse = (status === Status.Critical || status === Status.Failed) ? ' mcc-pulse' : '';
    return `<span class="mcc-status-dot${pulse}" style="width:${size}px;height:${size}px;background:${color};"></span>`;
  }

  static renderGoNoGo(vote: GoNoGo, size = 8): string {
    const color = vote === GoNoGo.Go ? '#22C55E' : vote === GoNoGo.NoGo ? '#EF4444' : '#F59E0B';
    return `<span class="mcc-status-dot" style="width:${size}px;height:${size}px;background:${color};"></span>`;
  }

  static statusColor(status: Status): string {
    switch (status) {
      case Status.Nominal: return '#2563EB';
      case Status.Advisory: return '#3B82F6';
      case Status.Caution: return '#F59E0B';
      case Status.Warning: return '#F97316';
      case Status.Critical: return '#EF4444';
      case Status.Failed: return '#EF4444';
      default: return '#94A3B8';
    }
  }
}
