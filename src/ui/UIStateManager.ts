/**
 * UI State Manager — controls panel focus, navigation, drill-down,
 * context-sensitive highlighting, and alert-linked navigation.
 */

import { EventBus } from '../core/EventBus.js';
import { Subsystem, Severity } from '../types/common.js';

export type UIPanel =
  | 'wall'              // main wall overview
  | 'workstation'       // workstation detail view
  | 'subsystem'         // subsystem deep-dive
  | 'procedures'        // procedure/checklist view
  | 'alerts'            // alert queue
  | 'transcript'        // dialogue transcript
  | 'trajectory'        // trajectory/map
  | 'timeline'          // mission timeline
  | 'command'           // command console
  | 'crew'              // crew status
  | 'debrief';          // post-mission debrief

export interface UIState {
  activePanel: UIPanel;
  previousPanels: UIPanel[];
  selectedSubsystem: Subsystem | null;
  selectedAlertId: string | null;
  selectedProcedureId: string | null;
  highlightedParameters: Set<string>;
  contextInfo: string | null;
  wallLayout: WallLayoutConfig;
}

export interface WallLayoutConfig {
  showTrajectory: boolean;
  showGroundTrack: boolean;
  showSystemCards: boolean;
  showEventLog: boolean;
  showAlertOverlay: boolean;
  showMETBar: boolean;
}

const DEFAULT_WALL_LAYOUT: WallLayoutConfig = {
  showTrajectory: true,
  showGroundTrack: true,
  showSystemCards: true,
  showEventLog: true,
  showAlertOverlay: true,
  showMETBar: true,
};

export class UIStateManager {
  private eventBus: EventBus;
  private state: UIState;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;

    this.state = {
      activePanel: 'wall',
      previousPanels: [],
      selectedSubsystem: null,
      selectedAlertId: null,
      selectedProcedureId: null,
      highlightedParameters: new Set(),
      contextInfo: null,
      wallLayout: { ...DEFAULT_WALL_LAYOUT },
    };

    // Alert-linked navigation: clicking critical alert focuses its subsystem
    this.eventBus.on('alert:created', (p) => {
      if (p.severity === Severity.Critical) {
        this.highlightSubsystem(p.subsystem);
      }
    });
  }

  /** Navigate to a panel. */
  navigateTo(panel: UIPanel): void {
    if (this.state.activePanel !== panel) {
      this.state.previousPanels.push(this.state.activePanel);
      if (this.state.previousPanels.length > 20) this.state.previousPanels.shift();
    }
    this.state.activePanel = panel;
  }

  /** Go back to previous panel. */
  goBack(): void {
    const prev = this.state.previousPanels.pop();
    if (prev) {
      this.state.activePanel = prev;
    }
  }

  /** Drill into a specific subsystem. */
  drillIntoSubsystem(subsystem: Subsystem): void {
    this.state.selectedSubsystem = subsystem;
    this.navigateTo('subsystem');
  }

  /** Focus on an alert. */
  focusAlert(alertId: string): void {
    this.state.selectedAlertId = alertId;
    this.navigateTo('alerts');
  }

  /** Focus on a procedure. */
  focusProcedure(procedureId: string): void {
    this.state.selectedProcedureId = procedureId;
    this.navigateTo('procedures');
  }

  /** Highlight a subsystem (for alert-linked focus). */
  highlightSubsystem(subsystem: Subsystem): void {
    this.state.selectedSubsystem = subsystem;
  }

  /** Highlight specific parameters (for trend/anomaly focus). */
  highlightParameters(params: string[]): void {
    this.state.highlightedParameters = new Set(params);
  }

  /** Clear highlights. */
  clearHighlights(): void {
    this.state.highlightedParameters.clear();
    this.state.selectedSubsystem = null;
  }

  /** Set context info (shown in context panel). */
  setContextInfo(info: string | null): void {
    this.state.contextInfo = info;
  }

  /** Update wall layout config. */
  setWallLayout(partial: Partial<WallLayoutConfig>): void {
    Object.assign(this.state.wallLayout, partial);
  }

  /** Get current UI state. */
  getState(): Readonly<UIState> {
    return this.state;
  }

  /** Get active panel. */
  getActivePanel(): UIPanel {
    return this.state.activePanel;
  }
}
