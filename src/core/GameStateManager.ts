/**
 * Game State Manager — controls the top-level game flow.
 *
 * Handles: boot → menu → mission brief → active mission → debrief
 * Also manages save/load, profiles, and settings.
 */

import { EventBus } from './EventBus.js';
import { GameState } from '../types/common.js';

export interface PlayerProfile {
  id: string;
  name: string;
  createdAt: number;
  lastPlayed: number;
  campaignProgress: CampaignProgress;
  settings: GameSettings;
}

export interface CampaignProgress {
  completedMissions: string[];
  unlockedMissions: string[];
  playerReputation: number;
  controllerTrust: Map<string, number>;
  crewHistory: Map<string, { alive: boolean; injuries: string[] }>;
  decisionsLog: string[];
  difficultyModifiers: Record<string, number>;
}

export interface GameSettings {
  masterVolume: number;
  voiceVolume: number;
  ambientVolume: number;
  alertVolume: number;
  autoPauseOnCritical: boolean;
  autoPauseOnDecision: boolean;
  showAssistHints: boolean;
  difficulty: 'easy' | 'normal' | 'hard' | 'custom';
  pauseRules: 'relaxed' | 'standard' | 'strict';
  proceduralStrictness: 'guided' | 'standard' | 'realistic';
}

const DEFAULT_SETTINGS: GameSettings = {
  masterVolume: 0.8,
  voiceVolume: 1.0,
  ambientVolume: 0.6,
  alertVolume: 1.0,
  autoPauseOnCritical: true,
  autoPauseOnDecision: true,
  showAssistHints: true,
  difficulty: 'normal',
  pauseRules: 'standard',
  proceduralStrictness: 'standard',
};

export interface SaveSlot {
  id: string;
  profileId: string;
  missionId: string;
  timestamp: number;
  label: string;
  type: 'manual' | 'checkpoint' | 'auto';
  data: string; // serialized mission state
}

export class GameStateManager {
  private eventBus: EventBus;
  private currentState: GameState = GameState.Boot;
  private activeProfile: PlayerProfile | null = null;
  private saves: Map<string, SaveSlot> = new Map();

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  /** Transition to a new game state with validation. */
  transitionTo(newState: GameState): void {
    if (!this.isValidTransition(this.currentState, newState)) {
      console.warn(`Invalid state transition: ${this.currentState} → ${newState}`);
      return;
    }
    const from = this.currentState;
    this.currentState = newState;
    this.eventBus.emit('game:stateChanged', { from, to: newState });
  }

  /** Get current game state. */
  getState(): GameState {
    return this.currentState;
  }

  /** Boot sequence — load profiles, initialize systems. */
  boot(): void {
    this.currentState = GameState.Boot;
    this.loadProfilesFromStorage();
    this.transitionTo(GameState.MainMenu);
  }

  /** Select or create a player profile. */
  selectProfile(profileId: string): void {
    const profiles = this.loadProfilesFromStorage();
    const profile = profiles.find(p => p.id === profileId);
    if (profile) {
      this.activeProfile = profile;
      this.activeProfile.lastPlayed = Date.now();
      this.saveProfilesToStorage(profiles);
    }
  }

  createProfile(name: string): PlayerProfile {
    const profile: PlayerProfile = {
      id: crypto.randomUUID(),
      name,
      createdAt: Date.now(),
      lastPlayed: Date.now(),
      campaignProgress: {
        completedMissions: [],
        unlockedMissions: ['mission_01'],
        playerReputation: 50,
        controllerTrust: new Map(),
        crewHistory: new Map(),
        decisionsLog: [],
        difficultyModifiers: {},
      },
      settings: { ...DEFAULT_SETTINGS },
    };
    this.activeProfile = profile;
    const profiles = this.loadProfilesFromStorage();
    profiles.push(profile);
    this.saveProfilesToStorage(profiles);
    return profile;
  }

  getActiveProfile(): PlayerProfile | null {
    return this.activeProfile;
  }

  /** Save current mission state. */
  saveGame(label: string, missionId: string, missionStateJson: string, type: SaveSlot['type'] = 'manual'): string {
    const profileId = this.activeProfile?.id;
    if (!profileId) throw new Error('No active profile');

    const slot: SaveSlot = {
      id: crypto.randomUUID(),
      profileId,
      missionId,
      timestamp: Date.now(),
      label,
      type,
      data: missionStateJson,
    };

    this.saves.set(slot.id, slot);
    this.persistSaves();
    this.eventBus.emit('game:saved', { slotId: slot.id, timestamp: slot.timestamp });
    return slot.id;
  }

  /** Load a saved game state. */
  loadGame(slotId: string): string | null {
    // Try in-memory first, then storage
    let slot = this.saves.get(slotId);
    if (!slot) {
      this.loadSavesFromStorage();
      slot = this.saves.get(slotId);
    }
    if (!slot) return null;

    this.eventBus.emit('game:loaded', { slotId });
    return slot.data;
  }

  /** List save slots for the active profile. */
  listSaves(): SaveSlot[] {
    this.loadSavesFromStorage();
    const profileId = this.activeProfile?.id;
    if (!profileId) return [];
    return Array.from(this.saves.values())
      .filter(s => s.profileId === profileId)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /** Get current settings. */
  getSettings(): GameSettings {
    return this.activeProfile?.settings ?? { ...DEFAULT_SETTINGS };
  }

  /** Update settings. */
  updateSettings(partial: Partial<GameSettings>): void {
    if (this.activeProfile) {
      Object.assign(this.activeProfile.settings, partial);
      const profiles = this.loadProfilesFromStorage();
      const idx = profiles.findIndex(p => p.id === this.activeProfile!.id);
      if (idx !== -1) profiles[idx] = this.activeProfile;
      this.saveProfilesToStorage(profiles);
    }
  }

  // ── State transition rules ──────────────────────────────────────

  private isValidTransition(from: GameState, to: GameState): boolean {
    const transitions: Record<GameState, GameState[]> = {
      [GameState.Boot]: [GameState.MainMenu],
      [GameState.MainMenu]: [GameState.ProfileSelect, GameState.Settings, GameState.MissionBrief],
      [GameState.ProfileSelect]: [GameState.MainMenu],
      [GameState.Settings]: [GameState.MainMenu, GameState.MissionPaused],
      [GameState.MissionBrief]: [GameState.MissionActive, GameState.MainMenu],
      [GameState.MissionActive]: [GameState.MissionPaused, GameState.MissionDebrief],
      [GameState.MissionPaused]: [GameState.MissionActive, GameState.Settings, GameState.MainMenu, GameState.MissionDebrief],
      [GameState.MissionDebrief]: [GameState.MainMenu, GameState.MissionBrief],
    };
    return transitions[from]?.includes(to) ?? false;
  }

  // ── Persistence helpers (localStorage) ──────────────────────────

  private loadProfilesFromStorage(): PlayerProfile[] {
    try {
      const raw = localStorage.getItem('gff_profiles');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private saveProfilesToStorage(profiles: PlayerProfile[]): void {
    try {
      localStorage.setItem('gff_profiles', JSON.stringify(profiles));
    } catch {
      console.warn('Failed to save profiles');
    }
  }

  private persistSaves(): void {
    try {
      const entries = Array.from(this.saves.entries());
      localStorage.setItem('gff_saves', JSON.stringify(entries));
    } catch {
      console.warn('Failed to persist saves');
    }
  }

  private loadSavesFromStorage(): void {
    try {
      const raw = localStorage.getItem('gff_saves');
      if (raw) {
        const entries: [string, SaveSlot][] = JSON.parse(raw);
        this.saves = new Map(entries);
      }
    } catch {
      // silently fail
    }
  }
}
