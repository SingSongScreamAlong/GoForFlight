/**
 * Voice Playback System — plays controller/crew voice lines through
 * the radio compression effect chain.
 *
 * Supports two backends:
 *   1. AudioBuffer playback (pre-generated TTS files)
 *   2. Web Speech API fallback (browser built-in, no files needed)
 *
 * Features:
 *   - Queue management with priority
 *   - Radio compression effect on all voice output
 *   - Interruption rules (critical can interrupt non-critical)
 *   - Per-controller voice settings (pitch/rate variation)
 *   - Subtitle sync events
 */

import { AudioEngine } from './AudioEngine.js';
import { EventBus } from '../core/EventBus.js';
import { DialogueLine } from '../controllers/DialogueSystem.js';
import { EntityId } from '../types/common.js';

/** Voice configuration per controller — makes each sound distinct. */
export interface VoiceProfile {
  controllerId: EntityId;
  /** Speech rate multiplier (0.8 = slow, 1.2 = fast). */
  rate: number;
  /** Pitch multiplier (0.8 = deeper, 1.2 = higher). */
  pitch: number;
  /** SpeechSynthesis voice name preference. */
  preferredVoice?: string;
}

interface QueuedVoiceLine {
  line: DialogueLine;
  profile?: VoiceProfile;
}

export class VoicePlayback {
  private engine: AudioEngine;
  private eventBus: EventBus;

  // Radio effect chain
  private radioInput: GainNode | null = null;
  private radioOutput: GainNode | null = null;

  // Voice state
  private queue: QueuedVoiceLine[] = [];
  private currentLine: QueuedVoiceLine | null = null;
  private speaking = false;
  private voiceProfiles = new Map<EntityId, VoiceProfile>();

  // Audio buffer cache for pre-generated TTS
  private audioCache = new Map<string, AudioBuffer>();
  private currentSource: AudioBufferSourceNode | null = null;

  // Web Speech API
  private synth: SpeechSynthesis | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private useSpeechAPI = true; // fallback when no audio files available

  // Settings
  private enabled = true;
  private radioEffectEnabled = true;

  constructor(engine: AudioEngine, eventBus: EventBus) {
    this.engine = engine;
    this.eventBus = eventBus;

    // Check for Web Speech API
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      this.synth = window.speechSynthesis;
    }

    // Auto-play dialogue lines from the dialogue system
    this.eventBus.on('controller:dialogue', (p) => {
      this.enqueue({
        id: `voice_${Date.now()}`,
        controllerId: p.controllerId,
        callsign: '',  // filled by dialogue system
        text: p.text,
        type: p.type as any,
        priority: p.type === 'escalation' ? 9 : p.type === 'warning' ? 7 : 5,
        timestamp: 0,
        interruptible: p.type !== 'escalation' && p.type !== 'warning',
      });
    });

    // Stop voice on pause
    this.eventBus.on('time:paused', () => {
      this.stopCurrent();
    });
  }

  /** Initialize the radio effect chain. Call after AudioEngine.init(). */
  initRadioChain(): void {
    if (!this.engine.isReady()) return;

    const chain = this.engine.createRadioEffectChain();
    this.radioInput = chain.input;
    this.radioOutput = chain.output;
    this.radioOutput.connect(this.engine.getChannelInput('voice'));
  }

  /** Register a voice profile for a controller (distinct pitch/rate). */
  registerVoiceProfile(profile: VoiceProfile): void {
    this.voiceProfiles.set(profile.controllerId, profile);
  }

  /** Pre-load an audio buffer for a specific line (TTS pre-generation). */
  cacheAudio(lineKey: string, buffer: AudioBuffer): void {
    this.audioCache.set(lineKey, buffer);
  }

  /** Load and cache an audio file from URL. */
  async loadAudio(lineKey: string, url: string): Promise<void> {
    const buffer = await this.engine.loadBuffer(url);
    this.audioCache.set(lineKey, buffer);
  }

  /** Enqueue a dialogue line for playback. */
  enqueue(line: DialogueLine): void {
    if (!this.enabled) return;

    const profile = this.voiceProfiles.get(line.controllerId);
    const entry: QueuedVoiceLine = { line, profile };

    // Check if this should interrupt current playback
    if (this.speaking && this.currentLine) {
      if (line.priority > this.currentLine.line.priority && this.currentLine.line.interruptible) {
        this.stopCurrent();
        this.queue.unshift(entry); // put at front
      } else {
        // Insert in priority order
        const insertIdx = this.queue.findIndex(q => q.line.priority < line.priority);
        if (insertIdx === -1) {
          this.queue.push(entry);
        } else {
          this.queue.splice(insertIdx, 0, entry);
        }
      }
    } else {
      this.queue.push(entry);
    }

    // Start playing if not already
    if (!this.speaking) {
      this.playNext();
    }
  }

  /** Skip the current line and move to next. */
  skip(): void {
    this.stopCurrent();
    this.playNext();
  }

  /** Clear the entire voice queue. */
  clearQueue(): void {
    this.queue = [];
    this.stopCurrent();
  }

  /** Enable/disable voice playback. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.clearQueue();
    }
  }

  /** Enable/disable radio compression effect. */
  setRadioEffect(enabled: boolean): void {
    this.radioEffectEnabled = enabled;
  }

  /** Get queue length. */
  getQueueLength(): number {
    return this.queue.length;
  }

  /** Check if currently speaking. */
  isSpeaking(): boolean {
    return this.speaking;
  }

  // ── Playback ──────────────────────────────────────────────────

  private playNext(): void {
    if (this.queue.length === 0) {
      this.speaking = false;
      this.currentLine = null;
      return;
    }

    const entry = this.queue.shift()!;
    this.currentLine = entry;
    this.speaking = true;

    // Check for cached audio buffer first
    const cacheKey = this.getCacheKey(entry.line);
    const cachedBuffer = this.audioCache.get(cacheKey);

    if (cachedBuffer) {
      this.playFromBuffer(cachedBuffer, entry);
    } else if (this.synth && this.useSpeechAPI) {
      this.playFromSpeechAPI(entry);
    } else {
      // No audio backend available — just emit subtitle and move on
      this.emitSubtitle(entry.line);
      setTimeout(() => {
        this.speaking = false;
        this.playNext();
      }, this.estimateDuration(entry.line.text));
    }
  }

  /** Play a voice line from a pre-loaded AudioBuffer through the radio effect. */
  private playFromBuffer(buffer: AudioBuffer, entry: QueuedVoiceLine): void {
    if (!this.engine.isReady()) {
      this.speaking = false;
      this.playNext();
      return;
    }

    const ctx = this.engine.getContext();
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    // Apply voice profile
    if (entry.profile) {
      source.playbackRate.value = entry.profile.rate;
    }

    // Route through radio effect if enabled
    if (this.radioEffectEnabled && this.radioInput) {
      source.connect(this.radioInput);
    } else {
      source.connect(this.engine.getChannelInput('voice'));
    }

    this.currentSource = source;
    this.emitSubtitle(entry.line);

    source.onended = () => {
      this.currentSource = null;
      this.speaking = false;
      this.playNext();
    };

    source.start();
  }

  /** Play a voice line using Web Speech API with radio-style modifications. */
  private playFromSpeechAPI(entry: QueuedVoiceLine): void {
    if (!this.synth) return;

    const utterance = new SpeechSynthesisUtterance(entry.line.text);

    // Apply voice profile for distinctiveness
    const profile = entry.profile;
    utterance.rate = profile?.rate ?? 1.0;
    utterance.pitch = profile?.pitch ?? 1.0;
    utterance.volume = 0.8;

    // Try to find a good voice
    const voices = this.synth.getVoices();
    if (profile?.preferredVoice) {
      const preferred = voices.find(v => v.name.includes(profile.preferredVoice!));
      if (preferred) utterance.voice = preferred;
    }
    // Fallback: try to get an English voice
    if (!utterance.voice) {
      const english = voices.find(v => v.lang.startsWith('en'));
      if (english) utterance.voice = english;
    }

    this.currentUtterance = utterance;
    this.emitSubtitle(entry.line);

    utterance.onend = () => {
      this.currentUtterance = null;
      this.speaking = false;
      // Small gap between lines for realism
      setTimeout(() => this.playNext(), 200 + Math.random() * 300);
    };

    utterance.onerror = () => {
      this.currentUtterance = null;
      this.speaking = false;
      this.playNext();
    };

    this.synth.speak(utterance);
  }

  /** Stop whatever is currently playing. */
  private stopCurrent(): void {
    // Stop AudioBuffer playback
    if (this.currentSource) {
      try { this.currentSource.stop(); } catch { /* already stopped */ }
      this.currentSource = null;
    }

    // Stop Speech API
    if (this.synth && this.currentUtterance) {
      this.synth.cancel();
      this.currentUtterance = null;
    }

    this.speaking = false;
    this.currentLine = null;
  }

  /** Emit a subtitle event for the UI to display. */
  private emitSubtitle(line: DialogueLine): void {
    this.eventBus.emit('controller:dialogue', {
      controllerId: line.controllerId,
      text: line.text,
      type: line.type as any,
    });
  }

  /** Estimate how long a text line takes to speak (ms). */
  private estimateDuration(text: string): number {
    const wordsPerMinute = 150;
    const words = text.split(/\s+/).length;
    return (words / wordsPerMinute) * 60 * 1000;
  }

  /** Generate a cache key for a dialogue line. */
  private getCacheKey(line: DialogueLine): string {
    return `${line.controllerId}_${line.text.substring(0, 50)}`;
  }
}
