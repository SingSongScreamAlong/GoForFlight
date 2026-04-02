/**
 * Trend Analysis System — detects slopes, threshold crossings,
 * and anomaly clues from parameter history.
 */

import { TimestampedValue, Subsystem, Severity } from '../types/common.js';
import { EventBus } from '../core/EventBus.js';

export interface TrendResult {
  parameter: string;
  subsystem: Subsystem;
  slope: number;              // units per second
  direction: 'rising' | 'falling' | 'stable';
  confidence: number;         // 0-1 how confident we are in the trend
  projectedCrossing?: {
    severity: Severity;
    estimatedTime: number;    // seconds from now
  };
}

export class TrendAnalyzer {
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  /** Analyze a parameter's history to detect trends. */
  analyze(
    subsystem: Subsystem,
    parameter: string,
    history: TimestampedValue[],
    thresholds?: { caution?: number; warning?: number; critical?: number },
  ): TrendResult | null {
    if (history.length < 5) return null;

    // Use last N points for linear regression
    const recent = history.slice(-30);

    const n = recent.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    const t0 = recent[0].time;

    for (const point of recent) {
      const x = point.time - t0;
      const y = point.value;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    }

    const denominator = n * sumX2 - sumX * sumX;
    if (Math.abs(denominator) < 0.0001) return null;

    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;

    // R² for confidence
    const meanY = sumY / n;
    let ssRes = 0, ssTot = 0;
    for (const point of recent) {
      const x = point.time - t0;
      const predicted = slope * x + intercept;
      ssRes += (point.value - predicted) ** 2;
      ssTot += (point.value - meanY) ** 2;
    }
    const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;

    const direction: TrendResult['direction'] =
      Math.abs(slope) < 0.001 ? 'stable' :
      slope > 0 ? 'rising' : 'falling';

    const result: TrendResult = {
      parameter,
      subsystem,
      slope,
      direction,
      confidence: Math.max(0, Math.min(1, rSquared)),
    };

    // Project threshold crossings
    if (thresholds && Math.abs(slope) > 0.0001) {
      const currentValue = recent[recent.length - 1].value;
      const currentTime = recent[recent.length - 1].time;

      const checkCrossing = (threshold: number, severity: Severity) => {
        if (slope > 0 && currentValue < threshold) {
          const timeToReach = (threshold - currentValue) / slope;
          if (timeToReach > 0 && timeToReach < 3600) {
            result.projectedCrossing = { severity, estimatedTime: timeToReach };
          }
        } else if (slope < 0 && currentValue > threshold) {
          const timeToReach = (threshold - currentValue) / slope;
          if (timeToReach > 0 && timeToReach < 3600) {
            result.projectedCrossing = { severity, estimatedTime: timeToReach };
          }
        }
      };

      // Check in order of severity — most severe wins
      if (thresholds.critical !== undefined) checkCrossing(thresholds.critical, Severity.Critical);
      else if (thresholds.warning !== undefined) checkCrossing(thresholds.warning, Severity.Warning);
      else if (thresholds.caution !== undefined) checkCrossing(thresholds.caution, Severity.Caution);
    }

    return result;
  }

  /** Compare expected vs actual values to detect deviations. */
  compareExpectedVsActual(
    expected: number,
    actual: number,
    tolerance: number,
  ): { deviation: number; withinTolerance: boolean } {
    const deviation = actual - expected;
    return {
      deviation,
      withinTolerance: Math.abs(deviation) <= tolerance,
    };
  }
}
