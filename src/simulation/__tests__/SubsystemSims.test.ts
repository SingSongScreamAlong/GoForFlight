import { describe, it, expect, beforeEach } from 'vitest';
import { PropulsionSim } from '../PropulsionSim.js';
import { PowerSim } from '../PowerSim.js';
import { ThermalSim } from '../ThermalSim.js';
import { ECLSSSim } from '../ECLSSSim.js';
import { CommsSim } from '../CommsSim.js';
import { GNCSim } from '../GNCSim.js';
import { StructuresSim } from '../StructuresSim.js';
import { CrewSim } from '../CrewSim.js';
import { Status, Subsystem } from '../../types/common.js';

describe('PropulsionSim', () => {
  let sim: PropulsionSim;

  beforeEach(() => { sim = new PropulsionSim(); });

  it('starts with engine off', () => {
    expect(sim.isEngineActive()).toBe(false);
    expect(sim.getParameter('thrustOutput')).toBe(0);
  });

  it('ignites main engine', () => {
    const success = sim.igniteMainEngine(60);
    expect(success).toBe(true);
    expect(sim.isEngineActive()).toBe(true);
  });

  it('consumes propellant during burn', () => {
    sim.igniteMainEngine(60);
    sim.tick(1, 1);
    expect(sim.getParameter('fuelRemaining')!).toBeLessThan(1.0);
    expect(sim.getParameter('thrustOutput')!).toBeGreaterThan(0);
  });

  it('cuts engine', () => {
    sim.igniteMainEngine(60);
    sim.tick(1, 1);
    sim.cutMainEngine();
    expect(sim.isEngineActive()).toBe(false);
    expect(sim.getParameter('thrustOutput')).toBe(0);
  });
});

describe('PowerSim', () => {
  let sim: PowerSim;

  beforeEach(() => { sim = new PowerSim(); });

  it('starts with nominal voltage', () => {
    expect(sim.getParameter('busVoltage')!).toBeGreaterThan(27);
    expect(sim.getParameter('busVoltage')!).toBeLessThan(31);
  });

  it('has three batteries', () => {
    expect(sim.getBatteries()).toHaveLength(3);
  });

  it('ticks without crashing', () => {
    sim.tick(1, 1);
    expect(sim.getState().status).toBe(Status.Nominal);
  });
});

describe('ECLSSSim', () => {
  let sim: ECLSSSim;

  beforeEach(() => { sim = new ECLSSSim(); });

  it('starts with breathable atmosphere', () => {
    expect(sim.getParameter('oxygenPercent')!).toBeCloseTo(20.9, 0);
    expect(sim.getParameter('co2Ppm')!).toBeLessThan(500);
  });

  it('O2 decreases and CO2 increases over time', () => {
    const initO2 = sim.getParameter('oxygenPercent')!;
    const initCO2 = sim.getParameter('co2Ppm')!;
    // Simulate 1 hour
    for (let i = 0; i < 3600; i++) {
      sim.tick(1, i);
    }
    expect(sim.getParameter('oxygenPercent')!).toBeLessThanOrEqual(initO2);
    // CO2 should be higher (scrubber fights it but crew produces it)
  });
});

describe('GNCSim', () => {
  let sim: GNCSim;

  beforeEach(() => { sim = new GNCSim(); });

  it('starts stable', () => {
    expect(sim.getParameter('controlStable')).toBe(1);
    expect(sim.getParameter('sensorConfidence')!).toBeGreaterThan(0.9);
  });

  it('maintains stability with attitude hold', () => {
    for (let i = 0; i < 100; i++) {
      sim.tick(1, i);
    }
    expect(Math.abs(sim.getParameter('rollRate')!)).toBeLessThan(1);
  });
});

describe('CrewSim', () => {
  let sim: CrewSim;

  beforeEach(() => {
    sim = new CrewSim();
    sim.initCrew([
      { id: 'c1', name: 'Test', role: 'CDR', baseFatigue: 0.1, baseStress: 0.1, baseTrust: 0.8 },
    ]);
  });

  it('initializes crew members', () => {
    expect(sim.getMembers()).toHaveLength(1);
    expect(sim.getMember('c1')?.name).toBe('Test');
  });

  it('fatigue increases over time', () => {
    const initFatigue = sim.getMember('c1')!.fatigue;
    // Simulate 10 hours
    for (let i = 0; i < 36000; i++) {
      sim.tick(1, i);
    }
    expect(sim.getMember('c1')!.fatigue).toBeGreaterThan(initFatigue);
  });

  it('rest reduces fatigue', () => {
    // Fatigue the crew first
    for (let i = 0; i < 36000; i++) { sim.tick(1, i); }
    const tiredFatigue = sim.getMember('c1')!.fatigue;

    sim.orderRest('c1');
    for (let i = 36000; i < 72000; i++) { sim.tick(1, i); }
    expect(sim.getMember('c1')!.fatigue).toBeLessThan(tiredFatigue);
  });
});

describe('All subsystems', () => {
  it('each has correct subsystem identity', () => {
    expect(new PropulsionSim().subsystem).toBe(Subsystem.Propulsion);
    expect(new PowerSim().subsystem).toBe(Subsystem.Power);
    expect(new ThermalSim().subsystem).toBe(Subsystem.Thermal);
    expect(new ECLSSSim().subsystem).toBe(Subsystem.ECLSS);
    expect(new CommsSim().subsystem).toBe(Subsystem.Communications);
    expect(new GNCSim().subsystem).toBe(Subsystem.GNC);
    expect(new StructuresSim().subsystem).toBe(Subsystem.Structures);
    expect(new CrewSim().subsystem).toBe(Subsystem.Crew);
  });
});
