/**
 * GO FOR FLIGHT — Main entry point.
 *
 * Boots the core systems and wires everything together.
 */

import { EventBus } from './core/EventBus.js';
import { TimeController } from './core/TimeController.js';
import { GameStateManager } from './core/GameStateManager.js';
import { MissionRuntime } from './core/MissionRuntime.js';
import { SimulationManager } from './core/SimulationManager.js';
import { MISSION_01_FIRST_ORBIT } from './data/mission_01_first_orbit.js';

// ── Bootstrap ─────────────────────────────────────────────────────

const eventBus = new EventBus();
const time = new TimeController(eventBus);
const gameState = new GameStateManager(eventBus);
const missionRuntime = new MissionRuntime(eventBus, time);
const simulation = new SimulationManager(eventBus);

// Wire up debug logging in development
if (import.meta.env.DEV) {
  eventBus.on('game:stateChanged', (p) => console.log(`[STATE] ${p.from} → ${p.to}`));
  eventBus.on('phase:changed', (p) => console.log(`[PHASE] ${p.from} → ${p.to} @ MET ${p.missionTime.toFixed(1)}s`));
  eventBus.on('mission:loaded', (p) => console.log(`[MISSION] Loaded: ${p.missionId}`));
  eventBus.on('mission:started', (p) => console.log(`[MISSION] Started: ${p.missionId}`));
  eventBus.on('alert:created', (p) => console.log(`[ALERT] ${p.severity}: ${p.message}`));
  eventBus.on('subsystem:statusChanged', (p) => console.log(`[SYS] ${p.subsystem}: ${p.from} → ${p.to}`));
  eventBus.on('time:paused', () => console.log('[TIME] Paused'));
  eventBus.on('time:resumed', (p) => console.log(`[TIME] Resumed @ ${p.timeScale}x`));
}

// ── Boot ──────────────────────────────────────────────────────────

gameState.boot();

// Export for console/debug access
(window as any).__gff = {
  eventBus,
  time,
  gameState,
  missionRuntime,
  simulation,
  missions: { MISSION_01_FIRST_ORBIT },
  // Quick start helper for development
  quickStart() {
    missionRuntime.loadMission(MISSION_01_FIRST_ORBIT);
    gameState.transitionTo('mission_brief' as any);
    missionRuntime.startMission();
    gameState.transitionTo('mission_active' as any);
    time.start();
    console.log('Mission started! Access systems via __gff.*');
  },
};

console.log('GO FOR FLIGHT — Engine Ready');
console.log('Run __gff.quickStart() to launch Mission 01');
