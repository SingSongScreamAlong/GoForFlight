import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../EventBus.js';
import { TimeController } from '../TimeController.js';
import { MissionRuntime } from '../MissionRuntime.js';
import { MISSION_01_FIRST_ORBIT } from '../../data/mission_01_first_orbit.js';
import { MissionPhase, ObjectiveStatus } from '../../types/common.js';

describe('MissionRuntime', () => {
  let bus: EventBus;
  let time: TimeController;
  let runtime: MissionRuntime;

  beforeEach(() => {
    bus = new EventBus();
    time = new TimeController(bus);
    runtime = new MissionRuntime(bus, time);
  });

  it('loads a mission definition', () => {
    const handler = vi.fn();
    bus.on('mission:loaded', handler);
    runtime.loadMission(MISSION_01_FIRST_ORBIT);
    expect(handler).toHaveBeenCalledWith({ missionId: 'mission_01' });
    expect(runtime.getDefinition()).toBe(MISSION_01_FIRST_ORBIT);
  });

  it('starts a mission', () => {
    const handler = vi.fn();
    bus.on('mission:started', handler);
    runtime.loadMission(MISSION_01_FIRST_ORBIT);
    runtime.startMission();
    expect(handler).toHaveBeenCalled();
    expect(runtime.getCurrentPhase()).toBe(MissionPhase.Prelaunch);
  });

  it('advances phases', () => {
    runtime.loadMission(MISSION_01_FIRST_ORBIT);
    runtime.startMission();
    expect(runtime.getCurrentPhase()).toBe(MissionPhase.Prelaunch);

    const handler = vi.fn();
    bus.on('phase:changed', handler);
    runtime.advancePhase();
    expect(runtime.getCurrentPhase()).toBe(MissionPhase.Countdown);
    expect(handler).toHaveBeenCalled();
  });

  it('updates objectives', () => {
    runtime.loadMission(MISSION_01_FIRST_ORBIT);
    runtime.startMission();

    const handler = vi.fn();
    bus.on('objective:statusChanged', handler);
    runtime.updateObjective('obj_launch', ObjectiveStatus.Completed);
    expect(handler).toHaveBeenCalledWith({
      objectiveId: 'obj_launch',
      from: ObjectiveStatus.Active,
      to: ObjectiveStatus.Completed,
    });
  });

  it('records decisions', () => {
    runtime.loadMission(MISSION_01_FIRST_ORBIT);
    runtime.startMission();

    const handler = vi.fn();
    bus.on('decision:made', handler);
    runtime.recordDecision({
      id: 'dec_1',
      description: 'Continue with launch',
      choice: 'go',
      alternatives: ['hold', 'scrub'],
      consequencesTriggered: [],
    });
    expect(handler).toHaveBeenCalled();
    expect(runtime.getState()!.decisionLog).toHaveLength(1);
  });

  it('serializes and deserializes state', () => {
    runtime.loadMission(MISSION_01_FIRST_ORBIT);
    runtime.startMission();
    runtime.advancePhase();
    runtime.updateObjective('obj_launch', ObjectiveStatus.Completed);

    const json = runtime.serialize();
    const newRuntime = new MissionRuntime(bus, time);
    newRuntime.loadMission(MISSION_01_FIRST_ORBIT);
    newRuntime.deserialize(json);

    expect(newRuntime.getCurrentPhase()).toBe(MissionPhase.Countdown);
    expect(newRuntime.getState()!.objectives.get('obj_launch')).toBe(ObjectiveStatus.Completed);
  });

  it('handles branch state', () => {
    runtime.loadMission(MISSION_01_FIRST_ORBIT);
    runtime.startMission();
    runtime.setBranch('weather_decision', 'proceed');
    expect(runtime.getBranch('weather_decision')).toBe('proceed');
  });

  it('aborts mission', () => {
    runtime.loadMission(MISSION_01_FIRST_ORBIT);
    runtime.startMission();

    const handler = vi.fn();
    bus.on('mission:aborted', handler);
    runtime.abortMission('ECLSS failure');
    expect(handler).toHaveBeenCalledWith({
      missionId: 'mission_01',
      reason: 'ECLSS failure',
    });
    expect(runtime.getCurrentPhase()).toBe(MissionPhase.Aborted);
  });
});
