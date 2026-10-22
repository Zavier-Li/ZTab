import type {DrawOptions} from './random-draw';
export const POSITIONS = ["OG", "OO", "CG", "CO"] as const;
export type Position = (typeof POSITIONS)[number];
export interface Team {
  id: string;
  name: string;
  speaker1: string;
  speaker2: string;
  institution: string;
  secondLanguage: boolean;
  isStrong?: boolean;
  active: boolean;
}
export interface Judge {
  id: string;
  name: string;
  institution: string;
  rating: number;
  active: boolean;
  workTask: string;
  workTime: string;
  conflictInstitutions: string[];
  conflictTeams: string[];
}
export interface Venue {
  id: string;
  name: string;
  active: boolean;
}
export interface Result {
  teamId: string;
  rank: number;
  score1: number | null;
  score2: number | null;
}
export interface JudgeBallot {
  judgeId: string;
  results: Result[];
  updatedAt: string;
}
export interface ScoreDraft {
  judgeId: string;
  ranks: string[];
  score1: string[];
  score2: string[];
  quick: string;
}
export interface Room {
  id: string;
  venueId: string;
  teamIds: string[];
  judges: { id: string; role: "Chair" | "Panel" | "Timer" }[];
  results: Result[];
  ballots?: JudgeBallot[];
  drafts?: ScoreDraft[];
}
export interface Round {
  id: string;
  no: number;
  rooms: Room[];
  createdAt: string;
  timeSlot?: string;
  bp?: {
    version: 1;
    seed: number;
    brackets: {level: number; allowed: number[]}[];
    pullups: string[];
    positionCost: number;
    priorPullupCost: number;
    repeatedPairs: number;
    repeatPositionTeams: string[];
  };
}
export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  teams: Team[];
  judges: Judge[];
  venues: Venue[];
  rounds: Round[];
  settings: { panelsPerRoom: number; assignTimer: boolean; preliminaryRounds?: number };
  eventPlan?: {
    timeSlots: string[];
    venueIds: string[];
    judgePanels: string[][][];
    tabOperator: string;
  };
  randomMeta?: {
    seed: number;
    mode: "random-new" | "adjusted";
    original: number[][][] | null;
    baseline: number[][][] | null;
    changed: number;
    teamOrder: string[];
    options?:DrawOptions;
    strongTeamIds?:string[];
    resources?: {method:'exhaustive-room-permutations'|'room-swap-search'; assignments:number; venueMax:number; judgeMax:number; conflictCount:number; cost:number[]; groupCandidates?:number};
  };
}
export const uid = () => crypto.randomUUID();
export function newProject(name = "未命名赛事"): Project {
  return {
    id: uid(),
    name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    teams: [],
    judges: [],
    venues: [],
    rounds: [],
    settings: { panelsPerRoom: 0, assignTimer: false },
  };
}
export const completeRound = (r: Round) =>
  r.rooms.length > 0 &&
  r.rooms.every(
    (room) =>
      room.results.length === 4 &&
      room.results.every((x) => room.teamIds.includes(x.teamId)) &&
      new Set(room.results.map((x) => x.teamId)).size === 4 &&
      room.results
        .map((x) => x.rank)
        .sort()
        .join() === "1,2,3,4",
  );

export const hasAnyScores=(p:Project)=>p.rounds.some(r=>r.rooms.some(room=>room.results.length>0||(room.ballots?.length??0)>0||(room.drafts?.length??0)>0));
