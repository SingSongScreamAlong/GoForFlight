import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../EventBus.js';

describe('EventBus', () => {
  it('emits events to listeners', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('time:paused', handler);
    bus.emit('time:paused', { missionTime: 42 });
    expect(handler).toHaveBeenCalledWith({ missionTime: 42 });
  });

  it('supports unsubscribe', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    const unsub = bus.on('time:paused', handler);
    unsub();
    bus.emit('time:paused', { missionTime: 0 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('fires once listeners only once', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.once('time:paused', handler);
    bus.emit('time:paused', { missionTime: 1 });
    bus.emit('time:paused', { missionTime: 2 });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('respects priority ordering', () => {
    const bus = new EventBus();
    const order: number[] = [];
    bus.on('time:paused', () => order.push(1), 1);
    bus.on('time:paused', () => order.push(3), 3);
    bus.on('time:paused', () => order.push(2), 2);
    bus.emit('time:paused', { missionTime: 0 });
    expect(order).toEqual([3, 2, 1]);
  });

  it('tracks event history', () => {
    const bus = new EventBus();
    bus.emit('time:paused', { missionTime: 10 });
    bus.emit('time:paused', { missionTime: 20 });
    const history = bus.getHistory('time:paused');
    expect(history).toHaveLength(2);
    expect(history[0].payload).toEqual({ missionTime: 10 });
  });

  it('suppresses events when told', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('time:paused', handler);
    bus.suppress('time:paused');
    bus.emit('time:paused', { missionTime: 0 });
    expect(handler).not.toHaveBeenCalled();
    bus.unsuppress('time:paused');
    bus.emit('time:paused', { missionTime: 0 });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('off removes all listeners for an event', () => {
    const bus = new EventBus();
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on('time:paused', h1);
    bus.on('time:paused', h2);
    bus.off('time:paused');
    bus.emit('time:paused', { missionTime: 0 });
    expect(h1).not.toHaveBeenCalled();
    expect(h2).not.toHaveBeenCalled();
  });
});
