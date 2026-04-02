/**
 * Room Ambience System — creates the sound of a working operations floor.
 *
 * Layers:
 *   1. Base room tone (HVAC hum, electrical buzz) — synthesized
 *   2. Keyboard/activity texture — randomized clicks
 *   3. Occasional radio static crackle
 *   4. Dynamic intensity — gets quieter during tense moments, louder during routine
 *
 * All synthesized — no audio files required.
 */

import { AudioEngine } from './AudioEngine.js';
import { EventBus } from '../core/EventBus.js';
import { MissionPhase } from '../types/common.js';

export class RoomAmbience {
  private engine: AudioEngine;
  private eventBus: EventBus;

  // Synth nodes
  private hvacOsc: OscillatorNode | null = null;
  private hvacGain: GainNode | null = null;
  private buzzOsc: OscillatorNode | null = null;
  private buzzGain: GainNode | null = null;
  private noiseSource: AudioBufferSourceNode | null = null;
  private noiseGain: GainNode | null = null;

  private running = false;
  private intensity = 0.5;   // 0-1 ambient intensity
  private clickInterval: ReturnType<typeof setInterval> | null = null;

  constructor(engine: AudioEngine, eventBus: EventBus) {
    this.engine = engine;
    this.eventBus = eventBus;

    // Adjust intensity based on mission phase
    this.eventBus.on('phase:changed', (p) => {
      switch (p.to) {
        case MissionPhase.Countdown:
          this.setIntensity(0.7); // room gets more active
          break;
        case MissionPhase.Ascent:
          this.setIntensity(0.9); // peak tension
          break;
        case MissionPhase.Orbit:
          this.setIntensity(0.4); // calmer ops
          break;
        case MissionPhase.Reentry:
          this.setIntensity(0.8);
          break;
        default:
          this.setIntensity(0.5);
      }
    });

    // Quiet down during critical moments (alert ducking handles volume,
    // but we also reduce the random click activity)
    this.eventBus.on('alert:created', (p) => {
      if (p.severity === 'critical') {
        this.setIntensity(0.2); // room goes quiet when shit hits the fan
      }
    });
  }

  /** Start ambient sound. */
  start(): void {
    if (this.running || !this.engine.isReady()) return;
    this.running = true;

    const ctx = this.engine.getContext();
    const ambienceChannel = this.engine.getChannelInput('ambience');

    // Layer 1: HVAC hum — low frequency drone
    this.hvacGain = ctx.createGain();
    this.hvacGain.gain.value = 0.08;
    this.hvacGain.connect(ambienceChannel);

    this.hvacOsc = ctx.createOscillator();
    this.hvacOsc.type = 'sine';
    this.hvacOsc.frequency.value = 60; // 60Hz electrical hum
    this.hvacOsc.connect(this.hvacGain);
    this.hvacOsc.start();

    // Layer 2: Electrical buzz — higher harmonic
    this.buzzGain = ctx.createGain();
    this.buzzGain.gain.value = 0.02;
    this.buzzGain.connect(ambienceChannel);

    this.buzzOsc = ctx.createOscillator();
    this.buzzOsc.type = 'sawtooth';
    this.buzzOsc.frequency.value = 120; // 120Hz buzz (2nd harmonic of mains)
    this.buzzOsc.connect(this.buzzGain);
    this.buzzOsc.start();

    // Layer 3: Filtered noise floor — air handling, distant activity
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0.03;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.value = 800;
    noiseFilter.Q.value = 0.5;
    noiseFilter.connect(this.noiseGain);
    this.noiseGain.connect(ambienceChannel);

    const noiseBuffer = this.createNoiseBuffer(ctx, 4); // 4 second loop
    this.noiseSource = ctx.createBufferSource();
    this.noiseSource.buffer = noiseBuffer;
    this.noiseSource.loop = true;
    this.noiseSource.connect(noiseFilter);
    this.noiseSource.start();

    // Layer 4: Random keyboard clicks/activity sounds
    this.startActivityClicks();
  }

  /** Stop all ambient sound. */
  stop(): void {
    if (!this.running) return;
    this.running = false;

    try {
      this.hvacOsc?.stop();
      this.buzzOsc?.stop();
      this.noiseSource?.stop();
    } catch {
      // already stopped
    }

    this.hvacOsc = null;
    this.buzzOsc = null;
    this.noiseSource = null;

    if (this.clickInterval !== null) {
      clearInterval(this.clickInterval);
      this.clickInterval = null;
    }
  }

  /** Set ambient intensity (0-1). Affects volume and click frequency. */
  setIntensity(intensity: number): void {
    this.intensity = Math.max(0, Math.min(1, intensity));

    if (!this.engine.isReady()) return;
    const ctx = this.engine.getContext();
    const now = ctx.currentTime;

    // Scale the layers
    if (this.hvacGain) {
      this.hvacGain.gain.linearRampToValueAtTime(0.08 * this.intensity, now + 1);
    }
    if (this.buzzGain) {
      this.buzzGain.gain.linearRampToValueAtTime(0.02 * this.intensity, now + 1);
    }
    if (this.noiseGain) {
      this.noiseGain.gain.linearRampToValueAtTime(0.03 * (0.5 + this.intensity * 0.5), now + 1);
    }
  }

  /** Play a single keyboard/console click. */
  playClick(): void {
    if (!this.engine.isReady()) return;

    const ctx = this.engine.getContext();
    const ambienceChannel = this.engine.getChannelInput('ambience');

    // Short noise burst filtered to sound like a key click
    const duration = 0.02 + Math.random() * 0.03; // 20-50ms
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 2000 + Math.random() * 4000; // high frequency click

    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0.02 + Math.random() * 0.03, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 3000 + Math.random() * 2000;
    filter.Q.value = 2;

    osc.connect(filter);
    filter.connect(clickGain);
    clickGain.connect(ambienceChannel);

    osc.start(now);
    osc.stop(now + duration);
  }

  /** Play a radio static crackle. */
  playStaticCrackle(): void {
    if (!this.engine.isReady()) return;

    const ctx = this.engine.getContext();
    const ambienceChannel = this.engine.getChannelInput('ambience');

    const duration = 0.1 + Math.random() * 0.3;
    const buffer = this.createNoiseBuffer(ctx, duration);
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 4000;
    filter.Q.value = 1;

    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ambienceChannel);

    source.start(now);
    source.stop(now + duration);
  }

  isRunning(): boolean { return this.running; }

  // ── Internals ─────────────────────────────────────────────────

  private startActivityClicks(): void {
    // Random clicks at variable rate based on intensity
    const scheduleNext = () => {
      if (!this.running) return;

      // Higher intensity = more frequent clicks
      const baseInterval = 300; // ms
      const varianceRange = 2000 * (1 - this.intensity);
      const interval = baseInterval + Math.random() * varianceRange;

      this.clickInterval = setTimeout(() => {
        if (this.running && Math.random() < this.intensity) {
          this.playClick();

          // Occasionally play a burst of clicks (someone typing)
          if (Math.random() < 0.15) {
            const burstCount = 3 + Math.floor(Math.random() * 8);
            for (let i = 0; i < burstCount; i++) {
              setTimeout(() => this.playClick(), i * (50 + Math.random() * 80));
            }
          }
        }

        // Occasional radio static
        if (Math.random() < 0.05) {
          this.playStaticCrackle();
        }

        scheduleNext();
      }, interval);
    };

    scheduleNext();
  }

  /** Generate a buffer of white noise. */
  private createNoiseBuffer(ctx: AudioContext, durationSeconds: number): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * durationSeconds);
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1);
    }

    return buffer;
  }
}
