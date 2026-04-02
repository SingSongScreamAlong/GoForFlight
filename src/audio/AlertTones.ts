/**
 * Alert Tone Synthesizer — generates caution/warning/critical tones
 * entirely from oscillators. No audio files needed.
 *
 * Modeled after real spacecraft alert tones:
 *   - Caution:  gentle two-tone beep, repeats slowly
 *   - Warning:  faster pulse, higher pitch, more urgent
 *   - Critical: continuous rapid alarm, impossible to ignore
 *
 * Each tone class supports: play once, repeat, stop.
 */

import { AudioEngine } from './AudioEngine.js';
import { EventBus } from '../core/EventBus.js';
import { Severity } from '../types/common.js';

interface ToneConfig {
  frequencies: number[];         // oscillator frequencies (Hz)
  pattern: number[];             // [on_ms, off_ms, on_ms, off_ms, ...]
  waveform: OscillatorType;
  gain: number;
  repeatInterval?: number;       // ms between full pattern repeats (undefined = one-shot)
}

const TONE_CONFIGS: Record<string, ToneConfig> = {
  // NASA-style "master caution" — two alternating tones
  caution: {
    frequencies: [880, 660],
    pattern: [200, 100, 200, 500],
    waveform: 'sine',
    gain: 0.3,
    repeatInterval: 3000,
  },

  // Faster, more urgent pulse
  warning: {
    frequencies: [1200, 900],
    pattern: [150, 75, 150, 75, 150, 300],
    waveform: 'sine',
    gain: 0.4,
    repeatInterval: 1500,
  },

  // Continuous rapid alarm — the "get everyone's attention NOW" tone
  critical: {
    frequencies: [1400, 1800],
    pattern: [100, 50, 100, 50, 100, 50, 100, 200],
    waveform: 'square',
    gain: 0.35,
    repeatInterval: 800,
  },

  // Soft single beep for info-level notifications
  info: {
    frequencies: [600],
    pattern: [120],
    waveform: 'sine',
    gain: 0.15,
  },

  // Confirmation beep (command accepted, step completed)
  confirm: {
    frequencies: [800, 1000],
    pattern: [80, 40, 120],
    waveform: 'sine',
    gain: 0.2,
  },

  // GO call tone — the satisfying "all stations GO" sound
  go: {
    frequencies: [523, 659, 784],  // C5, E5, G5 — major chord arpeggio
    pattern: [100, 50, 100, 50, 200],
    waveform: 'sine',
    gain: 0.25,
  },

  // NO-GO / abort tone — descending, ominous
  nogo: {
    frequencies: [784, 523, 392],  // G5, C5, G4 — descending
    pattern: [200, 50, 200, 50, 400],
    waveform: 'sawtooth',
    gain: 0.3,
  },
};

interface ActiveTone {
  id: string;
  intervalId: ReturnType<typeof setInterval> | null;
  playing: boolean;
}

export class AlertTones {
  private engine: AudioEngine;
  private eventBus: EventBus;
  private activeTones = new Map<string, ActiveTone>();
  private recentTones = new Map<string, number>(); // debounce tracking

  constructor(engine: AudioEngine, eventBus: EventBus) {
    this.engine = engine;
    this.eventBus = eventBus;

    // Auto-play tones on alert events
    this.eventBus.on('alert:created', (p) => {
      this.playForSeverity(p.severity as Severity, p.alertId);
    });

    this.eventBus.on('alert:escalated', (p) => {
      // Stop old tone, play new severity
      this.stop(p.alertId);
      this.playForSeverity(p.to as Severity, p.alertId);
    });

    this.eventBus.on('alert:resolved', (p) => {
      this.stop(p.alertId);
    });

    this.eventBus.on('alert:acknowledged', (p) => {
      // Acknowledgement stops the repeating tone but plays a confirm beep
      this.stop(p.alertId);
      this.playOnce('confirm');
    });

    // GO/NO-GO poll results
    this.eventBus.on('poll:completed', (p) => {
      if (p.result === 'go') {
        this.playOnce('go');
      } else if (p.result === 'no_go') {
        this.playOnce('nogo');
      }
    });

    // Pause/resume with game
    this.eventBus.on('time:paused', () => {
      this.stopAll();
    });
  }

  /** Play the appropriate tone for an alert severity. */
  playForSeverity(severity: Severity, id?: string): void {
    const toneId = id ?? `sev_${severity}_${Date.now()}`;

    // Debounce — don't spam the same severity
    const lastPlayed = this.recentTones.get(severity);
    if (lastPlayed && Date.now() - lastPlayed < 500) return;
    this.recentTones.set(severity, Date.now());

    switch (severity) {
      case Severity.Info:
        this.playOnce('info', toneId);
        break;
      case Severity.Caution:
        this.playRepeating('caution', toneId);
        break;
      case Severity.Warning:
        this.playRepeating('warning', toneId);
        break;
      case Severity.Critical:
        this.playRepeating('critical', toneId);
        break;
    }
  }

  /** Play a tone pattern once. */
  playOnce(toneName: string, id?: string): void {
    const config = TONE_CONFIGS[toneName];
    if (!config) return;

    const toneId = id ?? `${toneName}_${Date.now()}`;
    this.playPattern(config);
    this.activeTones.set(toneId, { id: toneId, intervalId: null, playing: true });
  }

  /** Play a tone pattern on repeat. */
  playRepeating(toneName: string, id: string): void {
    const config = TONE_CONFIGS[toneName];
    if (!config || !config.repeatInterval) return;

    // Don't duplicate
    if (this.activeTones.has(id)) return;

    this.playPattern(config);
    const intervalId = setInterval(() => {
      if (this.engine.isReady()) {
        this.playPattern(config);
      }
    }, config.repeatInterval);

    this.activeTones.set(id, { id, intervalId, playing: true });
  }

  /** Stop a specific tone. */
  stop(id: string): void {
    const active = this.activeTones.get(id);
    if (active) {
      if (active.intervalId !== null) {
        clearInterval(active.intervalId);
      }
      this.activeTones.delete(id);
    }
  }

  /** Stop all active tones. */
  stopAll(): void {
    for (const [id, active] of this.activeTones) {
      if (active.intervalId !== null) {
        clearInterval(active.intervalId);
      }
    }
    this.activeTones.clear();
  }

  /** Get count of active repeating tones. */
  getActiveToneCount(): number {
    return this.activeTones.size;
  }

  // ── Synthesis ─────────────────────────────────────────────────

  /**
   * Play a tone pattern using oscillators.
   * Pattern alternates between tones and silences.
   */
  private playPattern(config: ToneConfig): void {
    if (!this.engine.isReady()) return;

    const ctx = this.engine.getContext();
    const channelInput = this.engine.getChannelInput('alert');
    let timeOffset = 0;

    for (let i = 0; i < config.pattern.length; i++) {
      const duration = config.pattern[i] / 1000; // ms → seconds

      if (i % 2 === 0) {
        // Tone segment — pick frequency (cycle through available frequencies)
        const freq = config.frequencies[Math.floor(i / 2) % config.frequencies.length];
        this.playToneSegment(ctx, channelInput, freq, config.waveform, config.gain, timeOffset, duration);
      }
      // Odd indices are silence gaps — just advance the time

      timeOffset += duration;
    }
  }

  /** Play a single oscillator tone for a given duration. */
  private playToneSegment(
    ctx: AudioContext,
    destination: AudioNode,
    frequency: number,
    waveform: OscillatorType,
    gain: number,
    startOffset: number,
    duration: number,
  ): void {
    const now = ctx.currentTime;
    const startTime = now + startOffset;
    const endTime = startTime + duration;

    // Oscillator
    const osc = ctx.createOscillator();
    osc.type = waveform;
    osc.frequency.value = frequency;

    // Gain envelope — slight attack/release to avoid clicks
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0, startTime);
    envelope.gain.linearRampToValueAtTime(gain, startTime + 0.005); // 5ms attack
    envelope.gain.setValueAtTime(gain, endTime - 0.01);
    envelope.gain.linearRampToValueAtTime(0, endTime); // 10ms release

    osc.connect(envelope);
    envelope.connect(destination);

    osc.start(startTime);
    osc.stop(endTime + 0.02); // small buffer for release tail
  }
}
