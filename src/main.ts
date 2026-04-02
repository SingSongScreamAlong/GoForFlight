/**
 * GO FOR FLIGHT — Main entry point.
 *
 * Boots all systems, wires everything together, and starts the game loop.
 * No console commands needed — click BEGIN MISSION to play.
 */

// Core
import { EventBus } from './core/EventBus.js';
import { TimeController } from './core/TimeController.js';
import { GameStateManager } from './core/GameStateManager.js';
import { MissionRuntime } from './core/MissionRuntime.js';
import { SimulationManager } from './core/SimulationManager.js';

// Simulation
import { PropulsionSim } from './simulation/PropulsionSim.js';
import { PowerSim } from './simulation/PowerSim.js';
import { ThermalSim } from './simulation/ThermalSim.js';
import { ECLSSSim } from './simulation/ECLSSSim.js';
import { CommsSim } from './simulation/CommsSim.js';
import { GNCSim } from './simulation/GNCSim.js';
import { StructuresSim } from './simulation/StructuresSim.js';
import { CrewSim } from './simulation/CrewSim.js';

// Gameplay logic
import { AnomalyDatabase } from './anomaly/AnomalyDatabase.js';
import { AnomalyDirector } from './anomaly/AnomalyDirector.js';
import { AlertEngine } from './alerts/AlertEngine.js';
import { TrendAnalyzer } from './alerts/TrendAnalyzer.js';
import { CommandSystem } from './commands/CommandSystem.js';
import { FlightRulesEngine } from './commands/FlightRulesEngine.js';
import { GoNoGoPoll } from './commands/GoNoGoPoll.js';
import { DecisionEngine } from './commands/DecisionEngine.js';
import { ProcedureRunner } from './procedures/ProcedureRunner.js';

// Human layer
import { ControllerFramework } from './controllers/ControllerFramework.js';
import { DialogueSystem } from './controllers/DialogueSystem.js';
import { CrewTaskSystem } from './crew/CrewTaskSystem.js';
import { CrewCommsSystem } from './crew/CrewCommsSystem.js';

// Narrative
import { BriefingSystem } from './narrative/BriefingSystem.js';
import { DebriefSystem } from './narrative/DebriefSystem.js';
import { EventLogger } from './narrative/EventLogger.js';

// UI
import { UIStateManager } from './ui/UIStateManager.js';
import { GameFlowController } from './ui/GameFlowController.js';
import { MainMenuScreen } from './ui/screens/MainMenuScreen.js';
import { BriefingScreen } from './ui/screens/BriefingScreen.js';
import { ActiveMissionScreen } from './ui/screens/ActiveMissionScreen.js';
import { DebriefScreen } from './ui/screens/DebriefScreen.js';

// Audio
import { AudioEngine } from './audio/AudioEngine.js';
import { AlertTones } from './audio/AlertTones.js';
import { RoomAmbience } from './audio/RoomAmbience.js';
import { VoicePlayback } from './audio/VoicePlayback.js';

// Debug & Difficulty
import { DebugTools } from './debug/DebugTools.js';
import { DifficultySystem } from './core/DifficultySystem.js';

// Data
import { MISSION_01_FIRST_ORBIT } from './data/mission_01_first_orbit.js';
import { MISSION_01_ANOMALIES } from './data/anomalies_mission_01.js';
import { MISSION_01_PROCEDURES } from './data/procedures_mission_01.js';
import { GameState, MissionPhase, Subsystem } from './types/common.js';

// ══════════════════════════════════════════════════════════════════
//  SYSTEM INSTANTIATION
// ══════════════════════════════════════════════════════════════════

const eventBus = new EventBus();
const time = new TimeController(eventBus);
const gameState = new GameStateManager(eventBus);
const missionRuntime = new MissionRuntime(eventBus, time);
const simulation = new SimulationManager(eventBus);

// Subsystem simulations
const propulsionSim = new PropulsionSim();
const powerSim = new PowerSim();
const thermalSim = new ThermalSim();
const eclssSim = new ECLSSSim();
const commsSim = new CommsSim();
const gncSim = new GNCSim();
const structuresSim = new StructuresSim();
const crewSim = new CrewSim();

simulation.register(propulsionSim);
simulation.register(powerSim);
simulation.register(thermalSim);
simulation.register(eclssSim);
simulation.register(commsSim);
simulation.register(gncSim);
simulation.register(structuresSim);
simulation.register(crewSim);

// Cross-system dependencies
simulation.addDependency({
  from: Subsystem.Power, to: Subsystem.Thermal,
  apply: (source, target) => {
    const load = source.getParameter('totalLoadWatts') ?? 0;
    target.setParameter('avionicsTemp', (target.getParameter('avionicsTemp') ?? 35) + load * 0.00001);
  },
});
simulation.addDependency({
  from: Subsystem.Propulsion, to: Subsystem.Structures,
  apply: (source, target) => {
    const thrust = source.getParameter('thrustOutput') ?? 0;
    if (thrust > 0) target.setParameter('vibrationG', Math.min(8, thrust / 5000));
  },
});
simulation.addDependency({
  from: Subsystem.ECLSS, to: Subsystem.Crew,
  apply: (source, target) => {
    const o2 = source.getParameter('oxygenPercent') ?? 21;
    const co2 = source.getParameter('co2Ppm') ?? 400;
    if (o2 < 19 || co2 > 2000) {
      target.setParameter('avgStress', Math.min(1, (target.getParameter('avgStress') ?? 0) + 0.001));
    }
  },
});

// Gameplay logic
const anomalyDb = new AnomalyDatabase();
const anomalyDirector = new AnomalyDirector(eventBus, anomalyDb, simulation);
const alertEngine = new AlertEngine(eventBus);
const trendAnalyzer = new TrendAnalyzer(eventBus);
const commandSystem = new CommandSystem(eventBus, simulation);
const flightRules = new FlightRulesEngine(eventBus, simulation);
const goNoGoPoll = new GoNoGoPoll(eventBus, flightRules);
const decisionEngine = new DecisionEngine(eventBus);
const procedureRunner = new ProcedureRunner(eventBus, simulation);

// Human layer
const controllers = new ControllerFramework(eventBus, simulation);
const dialogue = new DialogueSystem(eventBus, controllers);
const crewTasks = new CrewTaskSystem(eventBus, crewSim);
const crewComms = new CrewCommsSystem(eventBus, crewSim);

// Narrative
const briefingSystem = new BriefingSystem();
const debriefSystem = new DebriefSystem(eventBus);
const eventLogger = new EventLogger(eventBus);

// Audio
const audioEngine = new AudioEngine(eventBus);
const alertTones = new AlertTones(audioEngine, eventBus);
const roomAmbience = new RoomAmbience(audioEngine, eventBus);
const voicePlayback = new VoicePlayback(audioEngine, eventBus);

// Difficulty
const difficulty = new DifficultySystem(eventBus);

// UI State
const uiState = new UIStateManager(eventBus);

// ══════════════════════════════════════════════════════════════════
//  GAME FLOW — the interactive loop
// ══════════════════════════════════════════════════════════════════

const appRoot = document.getElementById('app')!;

/** Called when player clicks BEGIN MISSION from main menu. */
function onStartMission(): void {
  // Register content
  anomalyDb.registerAll(MISSION_01_ANOMALIES);
  procedureRunner.registerAll(MISSION_01_PROCEDURES);

  // Load mission
  missionRuntime.loadMission(MISSION_01_FIRST_ORBIT);
  controllers.initFromRoster(MISSION_01_FIRST_ORBIT.controllerRoster);
  crewSim.initCrew(MISSION_01_FIRST_ORBIT.crewManifest);
  anomalyDirector.setPool(MISSION_01_FIRST_ORBIT.anomalyPool);

  // Setup voice profiles
  voicePlayback.initRadioChain();
  voicePlayback.registerVoiceProfile({ controllerId: 'ctrl_booster', rate: 0.95, pitch: 0.85 });
  voicePlayback.registerVoiceProfile({ controllerId: 'ctrl_eecom', rate: 1.0, pitch: 1.1 });
  voicePlayback.registerVoiceProfile({ controllerId: 'ctrl_gnc', rate: 1.1, pitch: 0.95 });
  voicePlayback.registerVoiceProfile({ controllerId: 'ctrl_electrical', rate: 0.9, pitch: 0.9 });
  voicePlayback.registerVoiceProfile({ controllerId: 'ctrl_thermal', rate: 1.0, pitch: 1.15 });
  voicePlayback.registerVoiceProfile({ controllerId: 'ctrl_inco', rate: 1.05, pitch: 1.0 });

  // Transition to briefing
  gameState.transitionTo(GameState.MissionBrief);
}

/** Called when player commits to launch after GO/NO-GO poll. */
function onProceedToMission(): void {
  missionRuntime.startMission();
  gameState.transitionTo(GameState.MissionActive);
  time.start();
  roomAmbience.start();
}

/** Auto-transition to debrief when mission ends. */
eventBus.on('mission:completed', () => {
  time.pause();
  setTimeout(() => gameState.transitionTo(GameState.MissionDebrief), 1500);
});
eventBus.on('mission:aborted', () => {
  time.pause();
  setTimeout(() => gameState.transitionTo(GameState.MissionDebrief), 2000);
});

// ── Build screens ────────────────────────────────────────────────

const rendererDeps = {
  eventBus, time, mission: missionRuntime, simulation,
  alerts: alertEngine, controllers, dialogue,
  procedures: procedureRunner, commands: commandSystem, uiState,
};

const mainMenuScreen = new MainMenuScreen({
  gameState,
  audioEngine,
  onStartMission,
});

const briefingScreen = new BriefingScreen({
  eventBus, gameState, mission: missionRuntime, time,
  poll: goNoGoPoll, controllers, alertTones,
  briefingData: briefingSystem.generateBriefing(MISSION_01_FIRST_ORBIT),
  onProceedToMission,
});

const activeMissionScreen = new ActiveMissionScreen({
  ...rendererDeps,
  gameState,
  poll: goNoGoPoll,
  roomAmbience,
  voicePlayback,
});

const debriefScreen = new DebriefScreen({
  gameState,
  getReport: () => debriefSystem.generate(
    missionRuntime, simulation, alertEngine, controllers, flightRules,
  ),
});

// ── Wire game flow controller ────────────────────────────────────

const flow = new GameFlowController({
  eventBus,
  gameState,
  root: appRoot,
  screens: {
    main_menu: mainMenuScreen,
    briefing: briefingScreen,
    active_mission: activeMissionScreen,
    debrief: debriefScreen,
  },
});

// ══════════════════════════════════════════════════════════════════
//  DEBUG
// ══════════════════════════════════════════════════════════════════

if (import.meta.env.DEV) {
  eventBus.on('game:stateChanged', (p) => console.log(`[STATE] ${p.from} → ${p.to}`));
  eventBus.on('phase:changed', (p) => console.log(`[PHASE] ${p.from} → ${p.to} @ MET ${p.missionTime.toFixed(1)}s`));
  eventBus.on('alert:created', (p) => console.log(`[ALERT] ${p.severity}: ${p.message}`));
  eventBus.on('anomaly:spawned', (p) => console.log(`[ANOMALY] Spawned: ${p.anomalyId}`));
  eventBus.on('controller:dialogue', (p) => console.log(`[VOICE] ${p.controllerId}: ${p.text}`));
}

const debugTools = new DebugTools({
  eventBus, time, mission: missionRuntime, simulation,
  anomalyDirector, alerts: alertEngine, flightRules, controllers,
});

// Console API
(window as any).__gff = {
  eventBus, time, gameState, missionRuntime, simulation,
  sims: { propulsionSim, powerSim, thermalSim, eclssSim, commsSim, gncSim, structuresSim, crewSim },
  anomalyDb, anomalyDirector, alertEngine, commandSystem, flightRules,
  goNoGoPoll, decisionEngine, procedureRunner,
  controllers, dialogue, crewTasks, crewComms,
  eventLogger, difficulty, uiState, debug: debugTools,
  audio: {
    engine: audioEngine, tones: alertTones, ambience: roomAmbience, voice: voicePlayback,
    setMasterVolume: (v: number) => audioEngine.setMasterVolume(v),
    mute: () => audioEngine.setMasterVolume(0),
    unmute: () => audioEngine.setMasterVolume(0.8),
    testCaution: () => alertTones.playOnce('caution'),
    testWarning: () => alertTones.playOnce('warning'),
    testCritical: () => alertTones.playOnce('critical'),
  },
};

// ══════════════════════════════════════════════════════════════════
//  BOOT
// ══════════════════════════════════════════════════════════════════

gameState.boot();
flow.start();

console.log('GO FOR FLIGHT — Ready');
console.log('Press ` for debug overlay');
