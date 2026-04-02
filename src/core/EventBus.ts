/**
 * Global Event Bus — the central nervous system of the game.
 *
 * Every subsystem communicates through typed events.
 * Supports prioritized listeners, one-shot subscriptions, and event history.
 */

import { GameEventMap, GameEventName, GameEventPayload } from '../types/events.js';

type Listener<E extends GameEventName> = (payload: GameEventPayload<E>) => void;

interface ListenerEntry<E extends GameEventName> {
  callback: Listener<E>;
  priority: number;
  once: boolean;
}

export class EventBus {
  private listeners = new Map<GameEventName, ListenerEntry<any>[]>();
  private history: Array<{ event: GameEventName; payload: unknown; timestamp: number }> = [];
  private maxHistory = 1000;
  private suppressedEvents = new Set<GameEventName>();

  /**
   * Subscribe to an event.
   * Higher priority listeners fire first (default 0).
   * Returns an unsubscribe function.
   */
  on<E extends GameEventName>(
    event: E,
    callback: Listener<E>,
    priority = 0,
  ): () => void {
    return this.addListener(event, callback, priority, false);
  }

  /** Subscribe to an event, automatically unsubscribing after one firing. */
  once<E extends GameEventName>(
    event: E,
    callback: Listener<E>,
    priority = 0,
  ): () => void {
    return this.addListener(event, callback, priority, true);
  }

  /** Emit an event to all listeners. */
  emit<E extends GameEventName>(event: E, payload: GameEventPayload<E>): void {
    if (this.suppressedEvents.has(event)) return;

    this.history.push({ event, payload, timestamp: performance.now() });
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    const entries = this.listeners.get(event);
    if (!entries) return;

    // Copy to avoid mutation during iteration
    const snapshot = [...entries];
    for (const entry of snapshot) {
      entry.callback(payload);
      if (entry.once) {
        this.removeEntry(event, entry);
      }
    }
  }

  /** Remove all listeners for an event, or all listeners if no event specified. */
  off<E extends GameEventName>(event?: E, callback?: Listener<E>): void {
    if (!event) {
      this.listeners.clear();
      return;
    }
    if (!callback) {
      this.listeners.delete(event);
      return;
    }
    const entries = this.listeners.get(event);
    if (entries) {
      const filtered = entries.filter(e => e.callback !== callback);
      if (filtered.length === 0) {
        this.listeners.delete(event);
      } else {
        this.listeners.set(event, filtered);
      }
    }
  }

  /** Temporarily suppress an event from being emitted. */
  suppress(event: GameEventName): void {
    this.suppressedEvents.add(event);
  }

  /** Resume emitting a suppressed event. */
  unsuppress(event: GameEventName): void {
    this.suppressedEvents.delete(event);
  }

  /** Get recent event history, optionally filtered by event name. */
  getHistory(event?: GameEventName, limit = 50): Array<{ event: GameEventName; payload: unknown; timestamp: number }> {
    const filtered = event
      ? this.history.filter(h => h.event === event)
      : this.history;
    return filtered.slice(-limit);
  }

  /** Clear all event history. */
  clearHistory(): void {
    this.history = [];
  }

  private addListener<E extends GameEventName>(
    event: E,
    callback: Listener<E>,
    priority: number,
    once: boolean,
  ): () => void {
    const entry: ListenerEntry<E> = { callback, priority, once };
    let entries = this.listeners.get(event);
    if (!entries) {
      entries = [];
      this.listeners.set(event, entries);
    }
    entries.push(entry);
    // Sort descending by priority so highest fires first
    entries.sort((a, b) => b.priority - a.priority);

    return () => this.removeEntry(event, entry);
  }

  private removeEntry<E extends GameEventName>(event: E, entry: ListenerEntry<E>): void {
    const entries = this.listeners.get(event);
    if (!entries) return;
    const idx = entries.indexOf(entry);
    if (idx !== -1) entries.splice(idx, 1);
    if (entries.length === 0) this.listeners.delete(event);
  }
}
