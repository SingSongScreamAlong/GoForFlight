/**
 * Time Control System — manages simulation clock, pause, time warp, and synchronized ticking.
 *
 * The simulation runs on mission elapsed time (MET), not wall clock.
 * All subsystems receive their dt from this controller via the event bus.
 */

import { EventBus } from './EventBus.js';
import { MissionTime } from '../types/common.js';

export interface TimeControllerConfig {
  /** Allowed time scale values (e.g. [0.1, 0.25, 0.5, 1, 2, 4, 10]) */
  allowedTimeScales: number[];
  /** Events that force auto-pause */
  autoPauseOnSeverity?: 'warning' | 'critical';
  /** Fixed simulation timestep in seconds (for determinism) */
  fixedTimestep: number;
}

const DEFAULT_CONFIG: TimeControllerConfig = {
  allowedTimeScales: [0.1, 0.25, 0.5, 1, 2, 4, 10],
  autoPauseOnSeverity: 'critical',
  fixedTimestep: 1 / 20, // 20 Hz simulation
};

export class TimeController {
  private config: TimeControllerConfig;
  private eventBus: EventBus;

  private paused = true;
  private timeScale = 1;
  private missionElapsedTime: MissionTime = 0; // seconds
  private accumulator = 0;
  private lastRealTime = 0;
  private animFrameId: number | null = null;

  // Countdown support
  private countdownTarget: MissionTime | null = null;
  private countdownActive = false;

  constructor(eventBus: EventBus, config?: Partial<TimeControllerConfig>) {
    this.eventBus = eventBus;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Auto-pause on critical alerts
    if (this.config.autoPauseOnSeverity) {
      const threshold = this.config.autoPauseOnSeverity;
      this.eventBus.on('alert:created', (payload) => {
        if (
          (threshold === 'critical' && payload.severity === 'critical') ||
          (threshold === 'warning' && (payload.severity === 'warning' || payload.severity === 'critical'))
        ) {
          this.pause();
        }
      });
    }
  }

  /** Start the simulation loop. */
  start(): void {
    this.paused = false;
    this.lastRealTime = performance.now() / 1000;
    this.eventBus.emit('time:resumed', {
      missionTime: this.missionElapsedTime,
      timeScale: this.timeScale,
    });
    this.loop();
  }

  /** Pause the simulation. */
  pause(): void {
    if (this.paused) return;
    this.paused = true;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.eventBus.emit('time:paused', { missionTime: this.missionElapsedTime });
  }

  /** Resume from pause. */
  resume(): void {
    if (!this.paused) return;
    this.start();
  }

  /** Toggle pause state. */
  togglePause(): void {
    if (this.paused) this.resume();
    else this.pause();
  }

  /** Set time scale. Must be one of the allowed values. */
  setTimeScale(scale: number): void {
    if (!this.config.allowedTimeScales.includes(scale)) {
      // Snap to nearest allowed
      scale = this.config.allowedTimeScales.reduce((prev, curr) =>
        Math.abs(curr - scale) < Math.abs(prev - scale) ? curr : prev
      );
    }
    this.timeScale = scale;
    this.eventBus.emit('time:scaleChanged', { timeScale: scale });
  }

  /** Step up to next faster time scale. */
  faster(): void {
    const scales = this.config.allowedTimeScales;
    const idx = scales.indexOf(this.timeScale);
    if (idx < scales.length - 1) {
      this.setTimeScale(scales[idx + 1]);
    }
  }

  /** Step down to next slower time scale. */
  slower(): void {
    const scales = this.config.allowedTimeScales;
    const idx = scales.indexOf(this.timeScale);
    if (idx > 0) {
      this.setTimeScale(scales[idx - 1]);
    }
  }

  /** Start a countdown timer that fires phase:countdown events. */
  startCountdown(targetMET: MissionTime): void {
    this.countdownTarget = targetMET;
    this.countdownActive = true;
  }

  /** Cancel active countdown. */
  cancelCountdown(): void {
    this.countdownActive = false;
    this.countdownTarget = null;
  }

  /** Get current mission elapsed time in seconds. */
  getMET(): MissionTime {
    return this.missionElapsedTime;
  }

  /** Get formatted MET string like "+000/00:52:49" */
  getFormattedMET(): string {
    const totalSeconds = Math.floor(this.missionElapsedTime);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const sign = this.missionElapsedTime >= 0 ? '+' : '-';
    return `${sign}${String(Math.abs(days)).padStart(3, '0')}/${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  /** Get current time scale. */
  getTimeScale(): number {
    return this.timeScale;
  }

  /** Check if paused. */
  isPaused(): boolean {
    return this.paused;
  }

  /** Set MET directly (for loading saves or countdown starts). */
  setMET(time: MissionTime): void {
    this.missionElapsedTime = time;
  }

  /** Stop the simulation loop entirely. */
  stop(): void {
    this.paused = true;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  /** Core simulation loop using fixed timestep with accumulator. */
  private loop = (): void => {
    if (this.paused) return;

    const now = performance.now() / 1000;
    const realDt = Math.min(now - this.lastRealTime, 0.25); // cap to prevent spiral
    this.lastRealTime = now;

    this.accumulator += realDt * this.timeScale;

    const fixedDt = this.config.fixedTimestep;
    while (this.accumulator >= fixedDt) {
      this.missionElapsedTime += fixedDt;
      this.accumulator -= fixedDt;

      // Emit tick for all subsystems
      this.eventBus.emit('time:tick', {
        dt: fixedDt,
        missionTime: this.missionElapsedTime,
        realTime: now,
      });

      // Countdown check
      if (this.countdownActive && this.countdownTarget !== null) {
        const remaining = this.countdownTarget - this.missionElapsedTime;
        this.eventBus.emit('phase:countdown', {
          secondsRemaining: Math.max(0, Math.ceil(remaining)),
        });
        if (remaining <= 0) {
          this.countdownActive = false;
          this.countdownTarget = null;
        }
      }
    }

    this.animFrameId = requestAnimationFrame(this.loop);
  };
}
