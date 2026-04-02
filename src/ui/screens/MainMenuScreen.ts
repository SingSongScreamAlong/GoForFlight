/**
 * Main Menu Screen — the title screen and mission select.
 */

import { Screen } from '../GameFlowController.js';
import { GameStateManager } from '../../core/GameStateManager.js';
import { AudioEngine } from '../../audio/AudioEngine.js';
import { GameState } from '../../types/common.js';

export interface MainMenuDeps {
  gameState: GameStateManager;
  audioEngine: AudioEngine;
  onStartMission: () => void;
}

export class MainMenuScreen implements Screen {
  private deps: MainMenuDeps;
  private root: HTMLElement | null = null;

  constructor(deps: MainMenuDeps) {
    this.deps = deps;
  }

  mount(root: HTMLElement): void {
    this.root = root;
    root.innerHTML = `
      <div class="gff-menu">
        <div class="gff-menu-bg"></div>
        <div class="gff-menu-content">
          <h1 class="gff-title">GO FOR FLIGHT</h1>
          <p class="gff-subtitle">MISSION CONTROL SIMULATION</p>

          <div class="gff-menu-divider"></div>

          <div class="gff-menu-buttons">
            <button class="gff-menu-btn gff-menu-primary" id="gff-btn-start">
              BEGIN MISSION
            </button>
            <button class="gff-menu-btn" id="gff-btn-settings" disabled>
              SETTINGS
            </button>
          </div>

          <div class="gff-menu-footer">
            <p>YOU ARE THE FLIGHT DIRECTOR.</p>
            <p>EVERY DECISION IS YOURS. EVERY CONSEQUENCE IS REAL.</p>
          </div>
        </div>
      </div>
      <style>
        .gff-menu {
          width: 100vw; height: 100vh;
          display: flex; align-items: center; justify-content: center;
          background: #0a0a0f;
          position: relative; overflow: hidden;
        }
        .gff-menu-bg {
          position: absolute; inset: 0;
          background: radial-gradient(ellipse at 50% 120%, rgba(0,50,30,0.15) 0%, transparent 60%);
        }
        .gff-menu-content {
          text-align: center; z-index: 1;
          font-family: 'Courier New', monospace;
        }
        .gff-title {
          font-size: 4rem; letter-spacing: 0.5em; margin-bottom: 8px;
          color: #00ff88;
          text-shadow: 0 0 40px rgba(0,255,136,0.2), 0 0 80px rgba(0,255,136,0.1);
          animation: gff-glow 3s ease-in-out infinite alternate;
        }
        @keyframes gff-glow {
          from { text-shadow: 0 0 40px rgba(0,255,136,0.2); }
          to { text-shadow: 0 0 60px rgba(0,255,136,0.3), 0 0 120px rgba(0,255,136,0.1); }
        }
        .gff-subtitle {
          font-size: 0.9rem; letter-spacing: 0.4em; color: #445;
          margin-bottom: 2rem;
        }
        .gff-menu-divider {
          width: 200px; height: 1px; background: #2a2a3a;
          margin: 2rem auto;
        }
        .gff-menu-buttons {
          display: flex; flex-direction: column; gap: 12px;
          align-items: center; margin-bottom: 3rem;
        }
        .gff-menu-btn {
          background: transparent; border: 1px solid #2a2a3a;
          color: #8888aa; font-family: 'Courier New', monospace;
          font-size: 1rem; letter-spacing: 0.3em; padding: 14px 48px;
          cursor: pointer; transition: all 0.2s; min-width: 280px;
        }
        .gff-menu-btn:hover:not(:disabled) {
          border-color: #00ff88; color: #00ff88;
          box-shadow: 0 0 20px rgba(0,255,136,0.1);
        }
        .gff-menu-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        .gff-menu-primary {
          border-color: #00ff88; color: #00ff88;
        }
        .gff-menu-footer {
          color: #333; font-size: 0.7rem; letter-spacing: 0.2em;
          line-height: 1.8;
        }
      </style>
    `;

    document.getElementById('gff-btn-start')?.addEventListener('click', async () => {
      // Initialize audio from user gesture
      await this.deps.audioEngine.init();
      this.deps.onStartMission();
    });
  }

  unmount(): void {
    this.root = null;
  }
}
