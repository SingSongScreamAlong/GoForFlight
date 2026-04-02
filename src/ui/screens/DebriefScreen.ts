/**
 * Debrief Screen — post-mission review.
 *
 * Shows grade, objectives, timeline, trust changes, resource summary.
 */

import { Screen } from '../GameFlowController.js';
import { DebriefReport, DebriefGrade } from '../../narrative/DebriefSystem.js';
import { GameStateManager } from '../../core/GameStateManager.js';
import { GameState } from '../../types/common.js';

export interface DebriefScreenDeps {
  gameState: GameStateManager;
  getReport: () => DebriefReport;
}

export class DebriefScreen implements Screen {
  private deps: DebriefScreenDeps;
  private root: HTMLElement | null = null;

  constructor(deps: DebriefScreenDeps) {
    this.deps = deps;
  }

  mount(root: HTMLElement): void {
    this.root = root;
    const report = this.deps.getReport();
    this.render(report);
  }

  unmount(): void {
    this.root = null;
  }

  private render(r: DebriefReport): void {
    const gradeColor = this.getGradeColor(r.grade);
    const duration = this.formatDuration(r.duration);

    this.root!.innerHTML = `
      <div class="gff-debrief">
        <div class="gff-debrief-header">
          <div class="gff-debrief-label">MISSION DEBRIEF</div>
          <h2 class="gff-debrief-title">${r.missionName.toUpperCase()}</h2>
          <div class="gff-debrief-result" style="color:${r.success ? '#00ff88' : '#ff3344'};">
            ${r.success ? 'MISSION SUCCESS' : 'MISSION FAILURE'}
          </div>
        </div>

        <div class="gff-debrief-grade-section">
          <div class="gff-debrief-grade" style="color:${gradeColor};border-color:${gradeColor};">
            ${r.grade}
          </div>
          <div class="gff-debrief-summary">${r.summary}</div>
        </div>

        <div class="gff-debrief-body">
          <div class="gff-debrief-columns">
            <div>
              <div class="gff-debrief-section-title">OBJECTIVES</div>
              ${r.objectiveResults.map(obj => {
                const icon = obj.status === 'completed' ? '✓' : obj.status === 'failed' ? '✗' : '—';
                const color = obj.status === 'completed' ? '#00ff88' : obj.status === 'failed' ? '#ff3344' : '#556';
                return `<div class="gff-debrief-item">
                  <span style="color:${color};font-weight:bold;">${icon}</span>
                  ${obj.name}
                  <span style="color:#556;font-size:0.7rem;">[${obj.type}]</span>
                </div>`;
              }).join('')}
            </div>

            <div>
              <div class="gff-debrief-section-title">MISSION STATS</div>
              <div class="gff-debrief-stat">
                <span>Duration</span><span>${duration}</span>
              </div>
              <div class="gff-debrief-stat">
                <span>Final Phase</span><span>${r.endPhase.toUpperCase()}</span>
              </div>
              <div class="gff-debrief-stat">
                <span>Total Alerts</span><span>${r.alertsTotal}</span>
              </div>
              <div class="gff-debrief-stat">
                <span>Critical Alerts</span>
                <span style="color:${r.alertsCritical > 0 ? '#ff3344' : '#00ff88'};">${r.alertsCritical}</span>
              </div>
              <div class="gff-debrief-stat">
                <span>Rules Violated</span>
                <span style="color:${r.rulesViolated.length > 0 ? '#f80' : '#00ff88'};">${r.rulesViolated.length}</span>
              </div>
              <div class="gff-debrief-stat">
                <span>Decisions Made</span><span>${r.decisions.length}</span>
              </div>
              <div class="gff-debrief-stat">
                <span>Anomalies</span><span>${r.anomalies.length}</span>
              </div>
            </div>
          </div>

          <div class="gff-debrief-section-title" style="margin-top:24px;">RESOURCES REMAINING</div>
          <div class="gff-debrief-resources">
            ${Object.entries(r.resourcesRemaining).map(([name, value]) => {
              const pct = Math.max(0, Math.min(100, value * 100));
              const color = pct > 30 ? '#00ff88' : pct > 15 ? '#ffcc00' : '#ff3344';
              return `<div class="gff-debrief-resource">
                <span>${name}</span>
                <div class="gff-debrief-bar">
                  <div class="gff-debrief-bar-fill" style="width:${pct}%;background:${color};"></div>
                </div>
                <span style="color:${color};">${pct.toFixed(0)}%</span>
              </div>`;
            }).join('')}
          </div>

          <div class="gff-debrief-section-title" style="margin-top:24px;">CONTROLLER TRUST</div>
          <div class="gff-debrief-trust">
            ${r.trustChanges.map(t => {
              const delta = t.to - t.from;
              const deltaColor = delta >= 0 ? '#00ff88' : '#ff3344';
              const deltaStr = delta >= 0 ? `+${(delta * 100).toFixed(0)}` : `${(delta * 100).toFixed(0)}`;
              return `<div class="gff-debrief-stat">
                <span>${t.callsign}</span>
                <span>${(t.to * 100).toFixed(0)}% <span style="color:${deltaColor};">(${deltaStr})</span></span>
              </div>`;
            }).join('')}
          </div>

          ${r.rulesViolated.length > 0 ? `
            <div class="gff-debrief-section-title" style="margin-top:24px;">FLIGHT RULES VIOLATED</div>
            ${r.rulesViolated.map(v => `<div class="gff-debrief-item" style="color:#f80;">⚠ ${v}</div>`).join('')}
          ` : ''}
        </div>

        <div class="gff-debrief-footer">
          <button class="gff-menu-btn gff-menu-primary" id="gff-btn-return">
            RETURN TO MAIN MENU
          </button>
        </div>
      </div>
      <style>
        .gff-debrief {
          width: 100vw; min-height: 100vh; background: #0a0a0f;
          font-family: 'Courier New', monospace; color: #c8c8d4;
          display: flex; flex-direction: column;
        }
        .gff-debrief-header {
          text-align: center; padding: 40px 20px 20px;
          border-bottom: 1px solid #2a2a3a;
        }
        .gff-debrief-label { font-size: 0.7rem; letter-spacing: 0.4em; color: #556; margin-bottom: 8px; }
        .gff-debrief-title { font-size: 1.8rem; letter-spacing: 0.3em; color: #00ccff; margin-bottom: 12px; }
        .gff-debrief-result { font-size: 1.2rem; letter-spacing: 0.3em; }
        .gff-debrief-grade-section { text-align: center; padding: 30px; }
        .gff-debrief-grade {
          display: inline-block; font-size: 4rem; font-weight: bold;
          border: 3px solid; width: 100px; height: 100px;
          line-height: 100px; text-align: center; margin-bottom: 16px;
        }
        .gff-debrief-summary { font-size: 0.85rem; color: #aab; max-width: 600px; margin: 0 auto; line-height: 1.6; }
        .gff-debrief-body { padding: 20px 60px; max-width: 900px; margin: 0 auto; width: 100%; }
        .gff-debrief-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; }
        .gff-debrief-section-title {
          font-size: 0.7rem; letter-spacing: 0.3em; color: #00ccff;
          border-bottom: 1px solid #1a1a25; padding-bottom: 4px; margin-bottom: 10px;
        }
        .gff-debrief-item { font-size: 0.8rem; padding: 4px 0; border-bottom: 1px solid rgba(42,42,58,0.3); }
        .gff-debrief-stat {
          display: flex; justify-content: space-between; font-size: 0.8rem;
          padding: 4px 0; border-bottom: 1px solid rgba(42,42,58,0.3);
        }
        .gff-debrief-resources { display: flex; flex-direction: column; gap: 8px; }
        .gff-debrief-resource {
          display: grid; grid-template-columns: 100px 1fr 50px; gap: 8px;
          align-items: center; font-size: 0.8rem;
        }
        .gff-debrief-bar { height: 8px; background: #1a1a25; border: 1px solid #2a2a3a; }
        .gff-debrief-bar-fill { height: 100%; transition: width 0.5s; }
        .gff-debrief-trust { max-width: 400px; }
        .gff-debrief-footer { text-align: center; padding: 30px; border-top: 1px solid #2a2a3a; }
        .gff-menu-btn {
          background: transparent; border: 1px solid #2a2a3a;
          color: #8888aa; font-family: 'Courier New', monospace;
          font-size: 1rem; letter-spacing: 0.3em; padding: 14px 48px;
          cursor: pointer; transition: all 0.2s;
        }
        .gff-menu-btn:hover { border-color: #00ff88; color: #00ff88; }
        .gff-menu-primary { border-color: #00ff88; color: #00ff88; }
      </style>
    `;

    document.getElementById('gff-btn-return')?.addEventListener('click', () => {
      this.deps.gameState.transitionTo(GameState.MainMenu);
    });
  }

  private getGradeColor(grade: DebriefGrade): string {
    switch (grade) {
      case 'S': return '#00ffff';
      case 'A': return '#00ff88';
      case 'B': return '#88ff00';
      case 'C': return '#ffcc00';
      case 'D': return '#ff8800';
      case 'F': return '#ff3344';
    }
  }

  private formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h}h ${m}m ${s}s`;
  }
}
