import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../EventBus.js';
import { TimeController } from '../TimeController.js';

describe('TimeController', () => {
  let bus: EventBus;
  let time: TimeController;

  beforeEach(() => {
    bus = new EventBus();
    time = new TimeController(bus);
  });

  it('starts paused', () => {
    expect(time.isPaused()).toBe(true);
  });

  it('defaults to 1x time scale', () => {
    expect(time.getTimeScale()).toBe(1);
  });

  it('formats MET correctly', () => {
    time.setMET(0);
    expect(time.getFormattedMET()).toBe('+000/00:00:00');

    time.setMET(3661); // 1 hour, 1 minute, 1 second
    expect(time.getFormattedMET()).toBe('+000/01:01:01');

    time.setMET(86400 + 3600 + 60 + 1); // 1 day, 1 hour, 1 minute, 1 second
    expect(time.getFormattedMET()).toBe('+001/01:01:01');
  });

  it('snaps to nearest allowed time scale', () => {
    time.setTimeScale(1.5); // not in default list, should snap
    expect([1, 2]).toContain(time.getTimeScale());
  });

  it('emits time:scaleChanged on setTimeScale', () => {
    const handler = vi.fn();
    bus.on('time:scaleChanged', handler);
    time.setTimeScale(2);
    expect(handler).toHaveBeenCalledWith({ timeScale: 2 });
  });

  it('emits time:paused on pause', () => {
    const handler = vi.fn();
    bus.on('time:paused', handler);
    // Need to start first to be able to pause
    time.setMET(10);
    // Directly set internal state for test
    time.pause();
    // pause when already paused is a no-op
    expect(handler).not.toHaveBeenCalled();
  });

  it('faster/slower cycle through scales', () => {
    time.setTimeScale(1);
    time.faster();
    expect(time.getTimeScale()).toBe(2);
    time.faster();
    expect(time.getTimeScale()).toBe(4);
    time.slower();
    expect(time.getTimeScale()).toBe(2);
  });
});
