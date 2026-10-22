import type { Project } from './types';

export interface ResetOptions {
  scores: boolean;
  schedule: boolean;
  teams: boolean;
  judges: boolean;
  venues: boolean;
  settings: boolean;
}

export const defaultResetOptions: ResetOptions = { scores: true, schedule: false, teams: false, judges: false, venues: false, settings: false };

export function resetProjectData(project: Project, options: ResetOptions): Project {
  const next = structuredClone(project);
  if (options.schedule || options.teams || options.venues) {
    next.rounds = [];
    delete next.randomMeta;
  } else {
    for (const round of next.rounds) for (const room of round.rooms) {
      if (options.scores) { room.results = []; room.ballots = []; room.drafts = []; }
      if (options.judges) {
        room.judges = [];
        room.ballots = [];
        room.drafts = room.drafts?.filter(d => d.judgeId === 'official');
      }
    }
  }
  if (options.teams) { next.teams = []; next.judges.forEach(j => { j.conflictTeams = []; }); }
  if (options.judges) {
    next.judges = [];
    if (next.eventPlan) next.eventPlan.judgePanels = next.eventPlan.judgePanels.map(round => round.map(() => []));
  }
  if (options.venues) { next.venues = []; delete next.eventPlan; }
  if (options.settings) {
    next.settings = { panelsPerRoom: 0, assignTimer: false };
    delete next.eventPlan;
  }
  return next;
}
