/**
 * GO FOR FLIGHT — Main entry point.
 *
 * Boots all systems and wires everything together.
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
import { Renderer } from './ui/Renderer.js';

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
import { GameState, Subsystem } from './types/common.js';

// ── Bootstrap core ────────────────────────────────────────────────

const eventBus = new EventBus();
const time = new TimeController(eventBus);
const gameState = new GameStateManager(eventBus);
const missionRuntime = new MissionRuntime(eventBus, time);
const simulation = new SimulationManager(eventBus);

// ── Register all subsystem simulations ────────────────────────────

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

// ── Cross-system dependencies ─────────────────────────────────────

// Power affects all subsystems (simplified: thermal loads change with power)
simulation.addDependency({
  from: Subsystem.Power,
  to: Subsystem.Thermal,
  apply: (source, target) => {
    const load = source.getParameter('totalLoadWatts') ?? 0;
    // Higher power draw = more heat generated in avionics
    target.setParameter('avionicsTemp', (target.getParameter('avionicsTemp') ?? 35) + load * 0.00001);
  },
});

// Propulsion affects structures (thrust = vibration)
simulation.addDependency({
  from: Subsystem.Propulsion,
  to: Subsystem.Structures,
  apply: (source, target) => {
    const thrust = source.getParameter('thrustOutput') ?? 0;
    if (thrust > 0) {
      target.setParameter('vibrationG', Math.min(8, thrust / 5000));
    }
  },
});

// ECLSS atmosphere affects crew
simulation.addDependency({
  from: Subsystem.ECLSS,
  to: Subsystem.Crew,
  apply: (source, target) => {
    const o2 = source.getParameter('oxygenPercent') ?? 21;
    const co2 = source.getParameter('co2Ppm') ?? 400;
    // Low O2 or high CO2 increases crew stress
    if (o2 < 19 || co2 > 2000) {
      const currentStress = target.getParameter('avgStress') ?? 0;
      target.setParameter('avgStress', Math.min(1, currentStress + 0.001));
    }
  },
});

// ── Gameplay logic systems ────────────────────────────────────────

const anomalyDb = new AnomalyDatabase();
const anomalyDirector = new AnomalyDirector(eventBus, anomalyDb, simulation);
const alertEngine = new AlertEngine(eventBus);
const trendAnalyzer = new TrendAnalyzer(eventBus);
const commandSystem = new CommandSystem(eventBus, simulation);
const flightRules = new FlightRulesEngine(eventBus, simulation);
const goNoGoPoll = new GoNoGoPoll(eventBus, flightRules);
const decisionEngine = new DecisionEngine(eventBus);
const procedureRunner = new ProcedureRunner(eventBus, simulation);

// ── Human layer ───────────────────────────────────────────────────

const controllers = new ControllerFramework(eventBus, simulation);
const dialogue = new DialogueSystem(eventBus, controllers);
const crewTasks = new CrewTaskSystem(eventBus, crewSim);
const crewComms = new CrewCommsSystem(eventBus, crewSim);

// ── Narrative systems ─────────────────────────────────────────────

const briefing = new BriefingSystem();
const debrief = new DebriefSystem(eventBus);
const eventLogger = new EventLogger(eventBus);

// ── Audio systems ─────────────────────────────────────────────────

const audioEngine = new AudioEngine(eventBus);
const alertTones = new AlertTones(audioEngine, eventBus);
const roomAmbience = new RoomAmbience(audioEngine, eventBus);
const voicePlayback = new VoicePlayback(audioEngine, eventBus);

// ── Difficulty ────────────────────────────────────────────────────

const difficulty = new DifficultySystem(eventBus);

// ── UI ────────────────────────────────────────────────────────────

const uiState = new UIStateManager(eventBus);
const renderer = new Renderer(document.getElementById('app')!, {
  eventBus,
  time,
  mission: missionRuntime,
  simulation,
  alerts: alertEngine,
  controllers,
  dialogue,
  procedures: procedureRunner,
  commands: commandSystem,
  uiState,
});

// ── Debug logging ─────────────────────────────────────────────────

if (import.meta.env.DEV) {
  eventBus.on('game:stateChanged', (p) => console.log(`[STATE] ${p.from} → ${p.to}`));
  eventBus.on('phase:changed', (p) => console.log(`[PHASE] ${p.from} → ${p.to} @ MET ${p.missionTime.toFixed(1)}s`));
  eventBus.on('mission:loaded', (p) => console.log(`[MISSION] Loaded: ${p.missionId}`));
  eventBus.on('mission:started', (p) => console.log(`[MISSION] Started: ${p.missionId}`));
  eventBus.on('alert:created', (p) => console.log(`[ALERT] ${p.severity}: ${p.message}`));
  eventBus.on('subsystem:statusChanged', (p) => console.log(`[SYS] ${p.subsystem}: ${p.from} → ${p.to}`));
  eventBus.on('anomaly:spawned', (p) => console.log(`[ANOMALY] Spawned: ${p.anomalyId}`));
  eventBus.on('controller:dialogue', (p) => console.log(`[VOICE] ${p.controllerId}: ${p.text}`));
  eventBus.on('flightRule:violated', (p) => console.log(`[RULE] Violated: ${p.description}`));
}

// ── Boot ──────────────────────────────────────────────────────────

gameState.boot();

// ── Quick start helper ────────────────────────────────────────────

async function quickStart() {
  // Load mission
  missionRuntime.loadMission(MISSION_01_FIRST_ORBIT);

  // Register content — anomalies and procedures
  anomalyDb.registerAll(MISSION_01_ANOMALIES);
  procedureRunner.registerAll(MISSION_01_PROCEDURES);

  // Initialize controllers from roster
  controllers.initFromRoster(MISSION_01_FIRST_ORBIT.controllerRoster);

  // Initialize crew
  crewSim.initCrew(MISSION_01_FIRST_ORBIT.crewManifest);

  // Set anomaly pool
  anomalyDirector.setPool(MISSION_01_FIRST_ORBIT.anomalyPool);

  // Initialize audio (must be called from user gesture context)
  await audioEngine.init();
  voicePlayback.initRadioChain();

  // Register distinct voice profiles for each controller
  voicePlayback.registerVoiceProfile({ controllerId: 'ctrl_booster', rate: 0.95, pitch: 0.85 });   // deeper, steady
  voicePlayback.registerVoiceProfile({ controllerId: 'ctrl_eecom', rate: 1.0, pitch: 1.1 });       // clear, slightly higher
  voicePlayback.registerVoiceProfile({ controllerId: 'ctrl_gnc', rate: 1.1, pitch: 0.95 });        // fast, precise
  voicePlayback.registerVoiceProfile({ controllerId: 'ctrl_electrical', rate: 0.9, pitch: 0.9 });  // calm, low
  voicePlayback.registerVoiceProfile({ controllerId: 'ctrl_thermal', rate: 1.0, pitch: 1.15 });    // quiet, higher
  voicePlayback.registerVoiceProfile({ controllerId: 'ctrl_inco', rate: 1.05, pitch: 1.0 });       // quick, neutral

  // Start room ambience
  roomAmbience.start();

  // Transition states
  gameState.transitionTo(GameState.MissionBrief);
  missionRuntime.startMission();
  gameState.transitionTo(GameState.MissionActive);

  // Start simulation and rendering
  time.start();
  renderer.start();

  console.log('═══════════════════════════════════════');
  console.log('  GO FOR FLIGHT — Mission 01 Active');
  console.log('  Audio: ON | Voice: ON | Ambience: ON');
  console.log('═══════════════════════════════════════');
  console.log('Systems accessible via __gff.*');
  console.log('Audio controls: __gff.audio.*');
}

// Export for console/debug access
(window as any).__gff = {
  // Core
  eventBus, time, gameState, missionRuntime, simulation,
  // Simulations
  sims: { propulsionSim, powerSim, thermalSim, eclssSim, commsSim, gncSim, structuresSim, crewSim },
  // Gameplay
  anomalyDb, anomalyDirector, alertEngine, trendAnalyzer,
  commandSystem, flightRules, goNoGoPoll, decisionEngine, procedureRunner,
  // Human
  controllers, dialogue, crewTasks, crewComms,
  // Narrative
  briefing, debrief, eventLogger,
  // Audio
  audio: {
    engine: audioEngine,
    tones: alertTones,
    ambience: roomAmbience,
    voice: voicePlayback,
    setMasterVolume: (v: number) => audioEngine.setMasterVolume(v),
    setVoiceVolume: (v: number) => audioEngine.setChannelVolume('voice', v),
    setAlertVolume: (v: number) => audioEngine.setChannelVolume('alert', v),
    setAmbienceVolume: (v: number) => audioEngine.setChannelVolume('ambience', v),
    mute: () => audioEngine.setMasterVolume(0),
    unmute: () => audioEngine.setMasterVolume(0.8),
    testCaution: () => alertTones.playOnce('caution'),
    testWarning: () => alertTones.playOnce('warning'),
    testCritical: () => alertTones.playOnce('critical'),
    testGo: () => alertTones.playOnce('go'),
    testNoGo: () => alertTones.playOnce('nogo'),
  },
  // Difficulty
  difficulty,
  // UI
  uiState, renderer,
  // Data
  missions: { MISSION_01_FIRST_ORBIT },
  anomalies: MISSION_01_ANOMALIES,
  procedures: MISSION_01_PROCEDURES,
  // Actions
  quickStart,
  // Helpers
  poll() {
    goNoGoPoll.startPoll(missionRuntime.getCurrentPhase()!);
    for (const ctrl of controllers.getAll()) {
      const vote = controllers.getVote(ctrl.id);
      goNoGoPoll.submitVote({
        controllerId: ctrl.id,
        subsystem: ctrl.subsystem,
        callsign: ctrl.callsign,
        vote: vote.vote,
        reason: vote.reason,
        confidence: vote.confidence,
      });
    }
    return goNoGoPoll.evaluate();
  },
  ignite(duration = 60) { propulsionSim.igniteMainEngine(duration); },
  injectFault(subsystem: string, param: string, severity = 0.5) {
    const sim = simulation.getSubsystem(subsystem as Subsystem);
    sim?.injectFault({
      id: `debug_fault_${Date.now()}`,
      hidden: false,
      severity,
      affectedParameters: [param],
      escalationRate: 0.01,
      timeActive: 0,
    });
  },
};

// ── Debug tools (press ` to toggle overlay) ──────────────────────

const debugTools = new DebugTools({
  eventBus, time,
  mission: missionRuntime,
  simulation,
  anomalyDirector,
  alerts: alertEngine,
  flightRules,
  controllers,
});

(window as any).__gff.debug = debugTools;

console.log('GO FOR FLIGHT — All Systems Ready');
console.log('Run __gff.quickStart() to launch Mission 01');
console.log('Press ` to toggle debug overlay');
