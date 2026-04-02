/**
 * Mission Briefing System — pre-mission overview.
 */

import { MissionDefinition, MissionBriefing } from '../types/mission.js';

export interface BriefingPresentation {
  missionName: string;
  overview: string;
  goals: string[];
  vehicleNotes: string;
  crewNotes: string;
  crewList: Array<{ name: string; role: string; personality: string }>;
  controllerList: Array<{ callsign: string; name: string; subsystem: string }>;
  knownRisks: string[];
  publicStakes?: string;
  difficulty: string;
}

export class BriefingSystem {
  /** Generate a briefing presentation from a mission definition. */
  generateBriefing(mission: MissionDefinition): BriefingPresentation {
    return {
      missionName: mission.name,
      overview: mission.briefing.overview,
      goals: mission.briefing.goals,
      vehicleNotes: mission.briefing.vehicleNotes,
      crewNotes: mission.briefing.crewNotes,
      crewList: mission.crewManifest.map(c => ({
        name: c.name,
        role: c.role,
        personality: c.personality,
      })),
      controllerList: mission.controllerRoster.map(c => ({
        callsign: c.callsign,
        name: c.name,
        subsystem: c.subsystem,
      })),
      knownRisks: mission.briefing.knownRisks,
      publicStakes: mission.briefing.publicStakes,
      difficulty: describeDifficulty(mission.difficulty),
    };
  }
}

function describeDifficulty(d: MissionDefinition['difficulty']): string {
  const avgDifficulty = (d.anomalyFrequency + d.anomalyAmbiguity + d.cascadeSpeed + (1 - d.resourceMargins)) / 4;
  if (avgDifficulty < 0.25) return 'INTRODUCTORY';
  if (avgDifficulty < 0.45) return 'STANDARD';
  if (avgDifficulty < 0.65) return 'CHALLENGING';
  return 'EXPERT';
}
