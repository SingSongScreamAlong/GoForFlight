/**
 * Audio Engine — the central audio mixer using Web Audio API.
 *
 * Manages audio channels, master volume, priority ducking,
 * and provides the shared AudioContext for all audio subsystems.
 *
 * Channel architecture:
 *   Source → Channel Gain → Channel Effects → Master Gain → Destination
 *
 * Channels:
 *   - voice:    controller/crew voice lines (highest priority)
 *   - alert:    caution/warning/critical tones
 *   - ambience: room tone, background texture
 *   - sfx:      UI sounds, button clicks, discrete effects
 */

import { EventBus } from '../core/EventBus.js';
import { Severity } from '../types/common.js';

export type AudioChannel = 'voice' | 'alert' | 'ambience' | 'sfx';

interface ChannelState {
  gainNode: GainNode;
  volume: number;        // user-set volume 0-1
  duckedVolume: number;  // current actual volume after ducking
  muted: boolean;
}

export class AudioEngine {
  private eventBus: EventBus;
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private channels = new Map<AudioChannel, ChannelState>();
  private masterVolume = 0.8;
  private initialized = false;
  private duckingActive = false;
  private duckingRestore: Map<AudioChannel, number> = new Map();

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;

    // Auto-duck on critical alerts
    this.eventBus.on('alert:created', (p) => {
      if (p.severity === Severity.Critical) {
        this.duckForPriority('alert', 0.6);
      }
    });
  }

  /**
   * Initialize the audio context. MUST be called from a user gesture
   * (click/keypress) due to browser autoplay policy.
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.masterVolume;
    this.masterGain.connect(this.ctx.destination);

    // Create channels
    this.createChannel('voice', 1.0);
    this.createChannel('alert', 1.0);
    this.createChannel('ambience', 0.4);
    this.createChannel('sfx', 0.7);

    this.initialized = true;

    // Resume if suspended (browser autoplay policy)
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  /** Get the raw AudioContext for advanced usage. */
  getContext(): AudioContext {
    if (!this.ctx) throw new Error('AudioEngine not initialized. Call init() first.');
    return this.ctx;
  }

  /** Get the gain node for a channel (for connecting sources). */
  getChannelInput(channel: AudioChannel): GainNode {
    const ch = this.channels.get(channel);
    if (!ch) throw new Error(`Channel ${channel} not found`);
    return ch.gainNode;
  }

  /** Set master volume (0-1). */
  setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    if (this.masterGain) {
      this.rampGain(this.masterGain, this.masterVolume, 0.05);
    }
  }

  getMasterVolume(): number {
    return this.masterVolume;
  }

  /** Set volume for a specific channel (0-1). */
  setChannelVolume(channel: AudioChannel, volume: number): void {
    const ch = this.channels.get(channel);
    if (!ch) return;
    ch.volume = Math.max(0, Math.min(1, volume));
    if (!ch.muted && !this.duckingActive) {
      this.rampGain(ch.gainNode, ch.volume, 0.05);
    }
  }

  getChannelVolume(channel: AudioChannel): number {
    return this.channels.get(channel)?.volume ?? 0;
  }

  /** Mute/unmute a channel. */
  muteChannel(channel: AudioChannel, muted: boolean): void {
    const ch = this.channels.get(channel);
    if (!ch) return;
    ch.muted = muted;
    this.rampGain(ch.gainNode, muted ? 0 : ch.volume, 0.05);
  }

  /**
   * Duck other channels to make a priority channel more audible.
   * Used for critical alerts and important voice lines.
   */
  duckForPriority(priorityChannel: AudioChannel, duckAmount = 0.3): void {
    if (!this.ctx) return;
    this.duckingActive = true;
    this.duckingRestore.clear();

    for (const [name, ch] of this.channels) {
      if (name === priorityChannel) continue;
      this.duckingRestore.set(name, ch.duckedVolume);
      ch.duckedVolume = ch.volume * duckAmount;
      this.rampGain(ch.gainNode, ch.duckedVolume, 0.1);
    }

    // Auto-restore after 3 seconds
    setTimeout(() => this.restoreFromDuck(), 3000);
  }

  /** Restore volumes after ducking. */
  restoreFromDuck(): void {
    if (!this.duckingActive) return;
    this.duckingActive = false;

    for (const [name, ch] of this.channels) {
      const restored = this.duckingRestore.get(name) ?? ch.volume;
      ch.duckedVolume = ch.volume;
      if (!ch.muted) {
        this.rampGain(ch.gainNode, ch.volume, 0.3);
      }
    }
    this.duckingRestore.clear();
  }

  /**
   * Create the "radio compression" effect chain used for voice lines.
   * Returns an input node to connect sources to and automatically routes to voice channel.
   *
   * Chain: input → highpass → compressor → bandpass → distortion → output
   */
  createRadioEffectChain(): { input: GainNode; output: GainNode } {
    const ctx = this.getContext();

    const input = ctx.createGain();
    input.gain.value = 1.0;

    // Highpass filter — cut low rumble, like a real radio
    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 300;
    highpass.Q.value = 0.7;

    // Compressor — squash dynamic range like radio AGC
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -30;
    compressor.knee.value = 10;
    compressor.ratio.value = 12;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.1;

    // Bandpass — restrict to voice frequencies
    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 2000;
    bandpass.Q.value = 0.5;

    // Subtle waveshaper for that slightly overdriven radio sound
    const waveshaper = ctx.createWaveShaper();
    waveshaper.curve = this.makeDistortionCurve(8);
    waveshaper.oversample = '2x';

    // Output gain for level control
    const output = ctx.createGain();
    output.gain.value = 1.5; // boost to compensate for bandpass loss

    // Wire the chain
    input.connect(highpass);
    highpass.connect(compressor);
    compressor.connect(bandpass);
    bandpass.connect(waveshaper);
    waveshaper.connect(output);

    return { input, output };
  }

  /**
   * Play a one-shot audio buffer on a channel.
   * Returns the source node for stop/control.
   */
  playBuffer(
    buffer: AudioBuffer,
    channel: AudioChannel,
    options?: { loop?: boolean; playbackRate?: number; detune?: number },
  ): AudioBufferSourceNode {
    const ctx = this.getContext();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = options?.loop ?? false;
    if (options?.playbackRate) source.playbackRate.value = options.playbackRate;
    if (options?.detune) source.detune.value = options.detune;

    source.connect(this.getChannelInput(channel));
    source.start();
    return source;
  }

  /**
   * Load an audio file from URL into an AudioBuffer.
   */
  async loadBuffer(url: string): Promise<AudioBuffer> {
    const ctx = this.getContext();
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    return ctx.decodeAudioData(arrayBuffer);
  }

  /** Get current audio context time. */
  getCurrentTime(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /** Check if audio is initialized and running. */
  isReady(): boolean {
    return this.initialized && this.ctx?.state === 'running';
  }

  /** Suspend audio (for game pause). */
  async suspend(): Promise<void> {
    if (this.ctx?.state === 'running') {
      await this.ctx.suspend();
    }
  }

  /** Resume audio (for game unpause). */
  async resume(): Promise<void> {
    if (this.ctx?.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  // ── Internal helpers ──────────────────────────────────────────

  private createChannel(name: AudioChannel, defaultVolume: number): void {
    if (!this.ctx || !this.masterGain) return;

    const gainNode = this.ctx.createGain();
    gainNode.gain.value = defaultVolume;
    gainNode.connect(this.masterGain);

    this.channels.set(name, {
      gainNode,
      volume: defaultVolume,
      duckedVolume: defaultVolume,
      muted: false,
    });
  }

  /** Smooth gain ramp to avoid clicks. */
  private rampGain(node: GainNode, target: number, duration: number): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    node.gain.cancelScheduledValues(now);
    node.gain.setValueAtTime(node.gain.value, now);
    node.gain.linearRampToValueAtTime(target, now + duration);
  }

  /** Generate a waveshaper curve for subtle distortion. */
  private makeDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
    const samples = 256;
    const curve = new Float32Array(samples) as Float32Array<ArrayBuffer>;
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }
}
