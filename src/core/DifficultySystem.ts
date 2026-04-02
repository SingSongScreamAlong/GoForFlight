/**
 * Difficulty & Assist System — makes the game accessible without dumbing it down.
 *
 * Three layers:
 *   1. Assist layer — UI hints, auto-pause, plain-English summaries
 *   2. Difficulty tuning — anomaly frequency, ambiguity, cascade speed, margins
 *   3. Custom difficulty — granular per-system overrides
 */

import { EventBus } from './EventBus.js';
import { Fraction } from '../types/common.js';

export type DifficultyPreset = 'easy' | 'normal' | 'hard' | 'realistic' | 'custom';

export interface DifficultyConfig {
  preset: DifficultyPreset;

  // ── Assist layer ────────────────────────────────────────────
  /** Show plain-English explanations of system states. */
  showPlainEnglish: boolean;
  /** Controllers give stronger, more explicit hints. */
  strongerHints: boolean;
  /** Auto-pause on critical decisions. */
  autoPauseOnDecision: boolean;
  /** Auto-pause when any alert reaches critical. */
  autoPauseOnCritical: boolean;
  /** Highlight the most important alerts/parameters. */
  highlightCritical: boolean;
  /** Show simplified procedure steps (less jargon). */
  simplifiedProcedures: boolean;
  /** Show recommended actions in the command panel. */
  showRecommendedActions: boolean;

  // ── Simulation tuning ───────────────────────────────────────
  /** How often anomalies spawn (0 = never, 1 = relentless). */
  anomalyFrequency: Fraction;
  /** How ambiguous anomaly symptoms are (0 = obvious, 1 = cryptic). */
  anomalyAmbiguity: Fraction;
  /** How fast cascading failures propagate (0 = slow, 1 = instant). */
  cascadeSpeed: Fraction;
  /** Starting resource margins (0 = razor thin, 1 = generous). */
  resourceMargins: Fraction;
  /** Quality of controller recommendations (0 = unreliable, 1 = perfect). */
  controllerHintQuality: Fraction;
  /** How severe hidden effects are (0 = mild, 1 = devastating). */
  hiddenEffectSeverity: Fraction;

  // ── Consequence tuning ──────────────────────────────────────
  /** How much trust changes from decisions (0 = forgiving, 1 = harsh). */
  trustConsequences: Fraction;
  /** Procedure strictness: can you skip steps freely? */
  procedureStrictness: 'guided' | 'standard' | 'realistic';
  /** Time pressure: how fast do time-sensitive situations escalate? */
  timePressure: Fraction;
  /** Is crew loss permanent across campaigns? */
  permadeath: boolean;
}

const PRESETS: Record<DifficultyPreset, DifficultyConfig> = {
  easy: {
    preset: 'easy',
    showPlainEnglish: true,
    strongerHints: true,
    autoPauseOnDecision: true,
    autoPauseOnCritical: true,
    highlightCritical: true,
    simplifiedProcedures: true,
    showRecommendedActions: true,
    anomalyFrequency: 0.15,
    anomalyAmbiguity: 0.1,
    cascadeSpeed: 0.2,
    resourceMargins: 0.9,
    controllerHintQuality: 0.95,
    hiddenEffectSeverity: 0.2,
    trustConsequences: 0.3,
    procedureStrictness: 'guided',
    timePressure: 0.3,
    permadeath: false,
  },

  normal: {
    preset: 'normal',
    showPlainEnglish: true,
    strongerHints: false,
    autoPauseOnDecision: true,
    autoPauseOnCritical: true,
    highlightCritical: true,
    simplifiedProcedures: false,
    showRecommendedActions: false,
    anomalyFrequency: 0.35,
    anomalyAmbiguity: 0.3,
    cascadeSpeed: 0.4,
    resourceMargins: 0.7,
    controllerHintQuality: 0.75,
    hiddenEffectSeverity: 0.4,
    trustConsequences: 0.5,
    procedureStrictness: 'standard',
    timePressure: 0.5,
    permadeath: false,
  },

  hard: {
    preset: 'hard',
    showPlainEnglish: false,
    strongerHints: false,
    autoPauseOnDecision: false,
    autoPauseOnCritical: false,
    highlightCritical: false,
    simplifiedProcedures: false,
    showRecommendedActions: false,
    anomalyFrequency: 0.55,
    anomalyAmbiguity: 0.6,
    cascadeSpeed: 0.6,
    resourceMargins: 0.4,
    controllerHintQuality: 0.5,
    hiddenEffectSeverity: 0.7,
    trustConsequences: 0.8,
    procedureStrictness: 'realistic',
    timePressure: 0.7,
    permadeath: false,
  },

  realistic: {
    preset: 'realistic',
    showPlainEnglish: false,
    strongerHints: false,
    autoPauseOnDecision: false,
    autoPauseOnCritical: false,
    highlightCritical: false,
    simplifiedProcedures: false,
    showRecommendedActions: false,
    anomalyFrequency: 0.7,
    anomalyAmbiguity: 0.8,
    cascadeSpeed: 0.8,
    resourceMargins: 0.25,
    controllerHintQuality: 0.4,
    hiddenEffectSeverity: 0.9,
    trustConsequences: 1.0,
    procedureStrictness: 'realistic',
    timePressure: 0.9,
    permadeath: true,
  },

  custom: {
    preset: 'custom',
    showPlainEnglish: true,
    strongerHints: false,
    autoPauseOnDecision: true,
    autoPauseOnCritical: true,
    highlightCritical: true,
    simplifiedProcedures: false,
    showRecommendedActions: false,
    anomalyFrequency: 0.35,
    anomalyAmbiguity: 0.3,
    cascadeSpeed: 0.4,
    resourceMargins: 0.7,
    controllerHintQuality: 0.75,
    hiddenEffectSeverity: 0.4,
    trustConsequences: 0.5,
    procedureStrictness: 'standard',
    timePressure: 0.5,
    permadeath: false,
  },
};

export class DifficultySystem {
  private eventBus: EventBus;
  private config: DifficultyConfig;

  constructor(eventBus: EventBus, preset: DifficultyPreset = 'normal') {
    this.eventBus = eventBus;
    this.config = { ...PRESETS[preset] };
  }

  /** Apply a preset. */
  setPreset(preset: DifficultyPreset): void {
    this.config = { ...PRESETS[preset] };
  }

  /** Override individual settings. */
  set(overrides: Partial<DifficultyConfig>): void {
    Object.assign(this.config, overrides);
    this.config.preset = 'custom';
  }

  /** Get the full config. */
  getConfig(): Readonly<DifficultyConfig> {
    return this.config;
  }

  /** Get a specific setting. */
  get<K extends keyof DifficultyConfig>(key: K): DifficultyConfig[K] {
    return this.config[key];
  }

  // ── Assist query helpers ──────────────────────────────────────

  /** Should the UI show plain-English explanations? */
  shouldShowPlainEnglish(): boolean { return this.config.showPlainEnglish; }

  /** Should controllers give stronger hints? */
  shouldGiveStrongHints(): boolean { return this.config.strongerHints; }

  /** Should the game auto-pause on critical alerts? */
  shouldAutoPauseOnCritical(): boolean { return this.config.autoPauseOnCritical; }

  /** Should the game auto-pause on major decisions? */
  shouldAutoPauseOnDecision(): boolean { return this.config.autoPauseOnDecision; }

  /** Should recommended actions be shown? */
  shouldShowRecommendations(): boolean { return this.config.showRecommendedActions; }

  // ── Simulation scaling helpers ────────────────────────────────

  /** Scale a base anomaly spawn interval by difficulty. */
  scaleAnomalyInterval(baseSeconds: number): number {
    return baseSeconds / Math.max(0.01, this.config.anomalyFrequency);
  }

  /** Scale cascade delay by difficulty. */
  scaleCascadeDelay(baseSeconds: number): number {
    return baseSeconds / Math.max(0.01, this.config.cascadeSpeed);
  }

  /** Scale initial resource amount by difficulty. */
  scaleResource(baseAmount: number): number {
    return baseAmount * this.config.resourceMargins;
  }

  /** Get the probability that a controller's recommendation is correct. */
  getHintAccuracy(): number {
    return this.config.controllerHintQuality;
  }

  /** Scale trust delta by difficulty. */
  scaleTrustDelta(baseDelta: number): number {
    return baseDelta * this.config.trustConsequences;
  }

  /** Scale time pressure (how fast situations escalate). */
  scaleTimePressure(baseRate: number): number {
    return baseRate * this.config.timePressure;
  }
}
