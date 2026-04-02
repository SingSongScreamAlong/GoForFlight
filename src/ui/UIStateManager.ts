/**
 * UI State Manager — controls panel focus, navigation, drill-down,
 * controller selection, and alert-linked navigation.
 */

import { EventBus } from '../core/EventBus.js';
import { Subsystem, Severity } from '../types/common.js';

export type UIPanel =
  | 'wall'
  | 'subsystem'
  | 'procedures'
  | 'alerts'
  | 'transcript'
  | 'command';

export type FloorViewMode = 'room' | 'controller_detail';

export interface UIState {
  activePanel: UIPanel;
  previousPanels: UIPanel[];
  selectedSubsystem: Subsystem | null;
  selectedControllerId: string | null;
  floorViewMode: FloorViewMode;
  selectedAlertId: string | null;
  selectedProcedureId: string | null;
  highlightedParameters: Set<string>;
  fdConsoleTab: 'alerts' | 'commands' | 'procedures' | 'transcript';
}

export class UIStateManager {
  private eventBus: EventBus;
  private state: UIState;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;

    this.state = {
      activePanel: 'wall',
      previousPanels: [],
      selectedSubsystem: null,
      selectedControllerId: null,
      floorViewMode: 'room',
      selectedAlertId: null,
      selectedProcedureId: null,
      highlightedParameters: new Set(),
      fdConsoleTab: 'alerts',
    };

    this.eventBus.on('alert:created', (p) => {
      if (p.severity === Severity.Critical) {
        this.highlightSubsystem(p.subsystem);
      }
    });
  }

  navigateTo(panel: UIPanel): void {
    if (this.state.activePanel !== panel) {
      this.state.previousPanels.push(this.state.activePanel);
      if (this.state.previousPanels.length > 20) this.state.previousPanels.shift();
    }
    this.state.activePanel = panel;
  }

  goBack(): void {
    if (this.state.floorViewMode === 'controller_detail') {
      this.deselectController();
      return;
    }
    const prev = this.state.previousPanels.pop();
    if (prev) this.state.activePanel = prev;
  }

  drillIntoSubsystem(subsystem: Subsystem): void {
    this.state.selectedSubsystem = subsystem;
    this.navigateTo('subsystem');
  }

  /** Select a controller seat — opens detail panel in the floor. */
  selectController(controllerId: string): void {
    this.state.selectedControllerId = controllerId;
    this.state.floorViewMode = 'controller_detail';
  }

  /** Deselect controller — return to room view. */
  deselectController(): void {
    this.state.selectedControllerId = null;
    this.state.floorViewMode = 'room';
  }

  setFDConsoleTab(tab: UIState['fdConsoleTab']): void {
    this.state.fdConsoleTab = tab;
  }

  focusAlert(alertId: string): void {
    this.state.selectedAlertId = alertId;
    this.state.fdConsoleTab = 'alerts';
  }

  focusProcedure(procedureId: string): void {
    this.state.selectedProcedureId = procedureId;
    this.state.fdConsoleTab = 'procedures';
  }

  highlightSubsystem(subsystem: Subsystem): void {
    this.state.selectedSubsystem = subsystem;
  }

  highlightParameters(params: string[]): void {
    this.state.highlightedParameters = new Set(params);
  }

  clearHighlights(): void {
    this.state.highlightedParameters.clear();
    this.state.selectedSubsystem = null;
  }

  getState(): Readonly<UIState> {
    return this.state;
  }

  getActivePanel(): UIPanel {
    return this.state.activePanel;
  }

  getFloorViewMode(): FloorViewMode {
    return this.state.floorViewMode;
  }

  getSelectedControllerId(): string | null {
    return this.state.selectedControllerId;
  }
}
