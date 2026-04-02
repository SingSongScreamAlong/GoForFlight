/**
 * Game Flow Controller — orchestrates the full game loop.
 *
 * Manages screen transitions:
 *   MainMenu → Briefing → Countdown/Poll → Active Mission → Debrief → MainMenu
 *
 * Each screen is a self-contained renderer that owns the #app element
 * for its duration. The active mission screen delegates to the existing Renderer.
 */

import { EventBus } from '../core/EventBus.js';
import { GameState } from '../types/common.js';
import { GameStateManager } from '../core/GameStateManager.js';

export type ScreenId = 'main_menu' | 'briefing' | 'active_mission' | 'debrief';

export interface Screen {
  mount(root: HTMLElement): void;
  unmount(): void;
}

export interface GameFlowDependencies {
  eventBus: EventBus;
  gameState: GameStateManager;
  root: HTMLElement;
  screens: Record<ScreenId, Screen>;
}

export class GameFlowController {
  private deps: GameFlowDependencies;
  private currentScreen: ScreenId | null = null;

  constructor(deps: GameFlowDependencies) {
    this.deps = deps;

    // React to game state transitions
    this.deps.eventBus.on('game:stateChanged', (p) => {
      this.onStateChange(p.to);
    });
  }

  /** Start the flow from the current game state. */
  start(): void {
    const state = this.deps.gameState.getState();
    this.onStateChange(state);
  }

  private onStateChange(state: GameState): void {
    const screenId = this.mapStateToScreen(state);
    if (screenId && screenId !== this.currentScreen) {
      this.switchScreen(screenId);
    }
  }

  private mapStateToScreen(state: GameState): ScreenId | null {
    switch (state) {
      case GameState.Boot:
      case GameState.MainMenu:
      case GameState.ProfileSelect:
      case GameState.Settings:
        return 'main_menu';
      case GameState.MissionBrief:
        return 'briefing';
      case GameState.MissionActive:
      case GameState.MissionPaused:
        return 'active_mission';
      case GameState.MissionDebrief:
        return 'debrief';
      default:
        return null;
    }
  }

  private switchScreen(screenId: ScreenId): void {
    // Unmount current
    if (this.currentScreen) {
      this.deps.screens[this.currentScreen].unmount();
    }

    // Mount new
    this.currentScreen = screenId;
    this.deps.root.innerHTML = '';
    this.deps.screens[screenId].mount(this.deps.root);
  }
}
