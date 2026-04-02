/**
 * Mission Briefing Screen — pre-mission overview before countdown.
 *
 * Shows mission goals, crew, controllers, known risks.
 * Player clicks "PROCEED TO COUNTDOWN" to begin.
 */

import { Screen } from '../GameFlowController.js';
import { BriefingPresentation } from '../../narrative/BriefingSystem.js';
import { GoNoGo, MissionPhase, Subsystem } from '../../types/common.js';
import { EventBus } from '../../core/EventBus.js';
import { GoNoGoPoll, PollVote } from '../../commands/GoNoGoPoll.js';
import { ControllerFramework } from '../../controllers/ControllerFramework.js';
import { AlertTones } from '../../audio/AlertTones.js';
import { MissionRuntime } from '../../core/MissionRuntime.js';
import { GameStateManager } from '../../core/GameStateManager.js';
import { GameState } from '../../types/common.js';
import { TimeController } from '../../core/TimeController.js';

export interface BriefingScreenDeps {
  eventBus: EventBus;
  gameState: GameStateManager;
  mission: MissionRuntime;
  time: TimeController;
  poll: GoNoGoPoll;
  controllers: ControllerFramework;
  alertTones: AlertTones;
  briefingData: BriefingPresentation;
  onProceedToMission: () => void;
}

type BriefingPhase = 'briefing' | 'poll' | 'result';

export class BriefingScreen implements Screen {
  private deps: BriefingScreenDeps;
  private root: HTMLElement | null = null;
  private phase: BriefingPhase = 'briefing';
  private pollVotes: PollVote[] = [];
  private pollResult: GoNoGo | null = null;
  private voteTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(deps: BriefingScreenDeps) {
    this.deps = deps;
  }

  mount(root: HTMLElement): void {
    this.root = root;
    this.phase = 'briefing';
    this.pollVotes = [];
    this.pollResult = null;
    this.render();
  }

  unmount(): void {
    if (this.voteTimer) clearTimeout(this.voteTimer);
    this.root = null;
  }

  private render(): void {
    if (!this.root) return;

    switch (this.phase) {
      case 'briefing': this.renderBriefing(); break;
      case 'poll': this.renderPoll(); break;
      case 'result': this.renderPollResult(); break;
    }
  }

  private renderBriefing(): void {
    const b = this.deps.briefingData;
    this.root!.innerHTML = `
      <div class="gff-brief">
        <div class="gff-brief-header">
          <div class="gff-brief-label">MISSION BRIEFING</div>
          <h2 class="gff-brief-title">${b.missionName.toUpperCase()}</h2>
          <div class="gff-brief-difficulty">${b.difficulty}</div>
        </div>

        <div class="gff-brief-body">
          <div class="gff-brief-section">
            <div class="gff-brief-section-title">OVERVIEW</div>
            <p>${b.overview}</p>
          </div>

          <div class="gff-brief-section">
            <div class="gff-brief-section-title">OBJECTIVES</div>
            ${b.goals.map((g, i) => `<div class="gff-brief-item">[ ${i + 1} ] ${g}</div>`).join('')}
          </div>

          <div class="gff-brief-columns">
            <div class="gff-brief-section">
              <div class="gff-brief-section-title">CREW</div>
              ${b.crewList.map(c => `
                <div class="gff-brief-item">
                  <strong>${c.role}:</strong> ${c.name}
                  <div class="gff-brief-note">${c.personality}</div>
                </div>
              `).join('')}
            </div>

            <div class="gff-brief-section">
              <div class="gff-brief-section-title">YOUR CONTROLLERS</div>
              ${b.controllerList.map(c => `
                <div class="gff-brief-item">
                  <strong>${c.callsign}</strong> — ${c.name}
                  <div class="gff-brief-note">${c.subsystem}</div>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="gff-brief-section gff-brief-risks">
            <div class="gff-brief-section-title">KNOWN RISKS</div>
            ${b.knownRisks.map(r => `<div class="gff-brief-item gff-risk-item">⚠ ${r}</div>`).join('')}
          </div>
        </div>

        <div class="gff-brief-footer">
          <button class="gff-menu-btn gff-menu-primary" id="gff-btn-proceed">
            PROCEED TO GO / NO-GO POLL
          </button>
        </div>
      </div>
      <style>
        .gff-brief {
          width: 100vw; height: 100vh; overflow-y: auto;
          background: #0a0a0f; color: #c8c8d4;
          font-family: 'Courier New', monospace;
          display: flex; flex-direction: column;
        }
        .gff-brief-header {
          text-align: center; padding: 40px 20px 20px;
          border-bottom: 1px solid #2a2a3a;
        }
        .gff-brief-label {
          font-size: 0.7rem; letter-spacing: 0.4em; color: #556; margin-bottom: 8px;
        }
        .gff-brief-title {
          font-size: 2rem; letter-spacing: 0.3em; color: #00ff88; margin-bottom: 8px;
        }
        .gff-brief-difficulty {
          font-size: 0.8rem; color: #ff0; letter-spacing: 0.2em;
        }
        .gff-brief-body {
          flex: 1; padding: 30px 60px; max-width: 900px; margin: 0 auto;
        }
        .gff-brief-section { margin-bottom: 24px; }
        .gff-brief-section-title {
          font-size: 0.7rem; letter-spacing: 0.3em; color: #00ccff;
          border-bottom: 1px solid #1a1a25; padding-bottom: 4px; margin-bottom: 10px;
        }
        .gff-brief-section p { font-size: 0.85rem; line-height: 1.6; color: #aab; }
        .gff-brief-item {
          font-size: 0.8rem; padding: 6px 0;
          border-bottom: 1px solid rgba(42,42,58,0.3);
        }
        .gff-brief-note { font-size: 0.7rem; color: #556; margin-top: 2px; }
        .gff-brief-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; }
        .gff-brief-risks { background: rgba(255,136,0,0.03); padding: 12px; border: 1px solid rgba(255,136,0,0.1); }
        .gff-risk-item { color: #f80; }
        .gff-brief-footer {
          text-align: center; padding: 30px;
          border-top: 1px solid #2a2a3a;
        }
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

    document.getElementById('gff-btn-proceed')?.addEventListener('click', () => {
      this.phase = 'poll';
      this.startPoll();
    });
  }

  private startPoll(): void {
    this.pollVotes = [];
    this.deps.poll.startPoll(MissionPhase.Prelaunch);
    this.render();

    // Roll in votes one by one with delays
    const ctrls = this.deps.controllers.getAll();
    ctrls.forEach((ctrl, idx) => {
      this.voteTimer = setTimeout(() => {
        const vote = this.deps.controllers.getVote(ctrl.id);
        const pollVote: PollVote = {
          controllerId: ctrl.id,
          subsystem: ctrl.subsystem,
          callsign: ctrl.callsign,
          vote: vote.vote,
          reason: vote.reason,
          confidence: vote.confidence,
        };
        this.deps.poll.submitVote(pollVote);
        this.pollVotes.push(pollVote);
        this.render();

        // After last vote, show result
        if (idx === ctrls.length - 1) {
          setTimeout(() => {
            const result = this.deps.poll.evaluate();
            this.pollResult = result?.result ?? GoNoGo.Standby;
            if (this.pollResult === GoNoGo.Go) {
              this.deps.alertTones.playOnce('go');
            } else {
              this.deps.alertTones.playOnce('nogo');
            }
            this.phase = 'result';
            this.render();
          }, 800);
        }
      }, 600 + idx * 900); // stagger votes
    });
  }

  private renderPoll(): void {
    const ctrls = this.deps.controllers.getAll();

    this.root!.innerHTML = `
      <div class="gff-poll">
        <div class="gff-poll-header">
          <div class="gff-poll-label">GO / NO-GO POLL</div>
          <div class="gff-poll-sublabel">PRE-LAUNCH SYSTEMS VERIFICATION</div>
        </div>
        <div class="gff-poll-grid">
          ${ctrls.map(ctrl => {
            const vote = this.pollVotes.find(v => v.controllerId === ctrl.id);
            const voteClass = !vote ? 'pending' : vote.vote === GoNoGo.Go ? 'go' : vote.vote === GoNoGo.NoGo ? 'nogo' : 'standby';
            const voteText = !vote ? '...' : vote.vote.toUpperCase().replace('_', '-');
            return `
              <div class="gff-poll-card gff-poll-${voteClass}">
                <div class="gff-poll-callsign">${ctrl.callsign}</div>
                <div class="gff-poll-name">${ctrl.name}</div>
                <div class="gff-poll-vote">${voteText}</div>
                ${vote?.reason ? `<div class="gff-poll-reason">${vote.reason}</div>` : ''}
              </div>
            `;
          }).join('')}
        </div>
        <div class="gff-poll-waiting">POLLING STATIONS...</div>
      </div>
      <style>
        .gff-poll {
          width: 100vw; height: 100vh; background: #0a0a0f;
          font-family: 'Courier New', monospace;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
        }
        .gff-poll-header { text-align: center; margin-bottom: 40px; }
        .gff-poll-label { font-size: 1.5rem; letter-spacing: 0.4em; color: #00ccff; }
        .gff-poll-sublabel { font-size: 0.7rem; letter-spacing: 0.3em; color: #556; margin-top: 8px; }
        .gff-poll-grid {
          display: grid; grid-template-columns: repeat(3, 200px); gap: 16px;
          margin-bottom: 30px;
        }
        .gff-poll-card {
          border: 1px solid #2a2a3a; padding: 16px; text-align: center;
          transition: all 0.4s;
        }
        .gff-poll-callsign { font-size: 0.9rem; letter-spacing: 0.2em; color: #556; }
        .gff-poll-name { font-size: 0.7rem; color: #445; margin: 4px 0 8px; }
        .gff-poll-vote { font-size: 1.3rem; font-weight: bold; letter-spacing: 0.2em; }
        .gff-poll-reason { font-size: 0.65rem; color: #778; margin-top: 6px; }
        .gff-poll-pending .gff-poll-vote { color: #333; }
        .gff-poll-go { border-color: #00ff88; }
        .gff-poll-go .gff-poll-vote { color: #00ff88; }
        .gff-poll-go .gff-poll-callsign { color: #00ff88; }
        .gff-poll-nogo { border-color: #ff3344; background: rgba(255,51,68,0.05); }
        .gff-poll-nogo .gff-poll-vote { color: #ff3344; }
        .gff-poll-standby { border-color: #ffcc00; }
        .gff-poll-standby .gff-poll-vote { color: #ffcc00; }
        .gff-poll-waiting { color: #556; font-size: 0.8rem; letter-spacing: 0.2em; }
      </style>
    `;
  }

  private renderPollResult(): void {
    const isGo = this.pollResult === GoNoGo.Go;

    this.root!.innerHTML = `
      <div class="gff-poll">
        <div class="gff-poll-header">
          <div class="gff-poll-label">${isGo ? 'ALL STATIONS GO' : 'HOLD'}</div>
          <div class="gff-poll-result" style="color:${isGo ? '#00ff88' : '#ff3344'};font-size:3rem;margin-top:20px;">
            ${isGo ? 'GO FOR LAUNCH' : 'NO-GO'}
          </div>
        </div>
        <div style="margin-top:40px;">
          ${isGo ? `
            <button class="gff-menu-btn gff-menu-primary" id="gff-btn-launch">
              COMMIT TO LAUNCH
            </button>
          ` : `
            <button class="gff-menu-btn" id="gff-btn-retry" style="border-color:#ffcc00;color:#ffcc00;">
              RETRY POLL
            </button>
          `}
        </div>
      </div>
      <style>
        .gff-poll {
          width: 100vw; height: 100vh; background: #0a0a0f;
          font-family: 'Courier New', monospace;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
        }
        .gff-poll-header { text-align: center; }
        .gff-poll-label { font-size: 1.2rem; letter-spacing: 0.4em; color: #00ccff; }
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

    if (isGo) {
      document.getElementById('gff-btn-launch')?.addEventListener('click', () => {
        this.deps.onProceedToMission();
      });
    } else {
      document.getElementById('gff-btn-retry')?.addEventListener('click', () => {
        this.phase = 'poll';
        this.startPoll();
      });
    }
  }
}
