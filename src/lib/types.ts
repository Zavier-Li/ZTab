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
export interface DrawSnapshotRoom {
  id: string;
  venueId: string;
  teamIds: string[];
  judges: { id: string; role: "Chair" | "Panel" | "Timer" }[];
}
export interface DrawSnapshotRound {
  id: string;
  no: number;
  createdAt: string;
  timeSlot?: string;
  rooms: DrawSnapshotRoom[];
  bp?: Round["bp"];
}
export interface DrawSnapshot {
  id: string;
  savedAt: string;
  action: "generated" | "edited" | "restored";
  name?: string;
  rounds: DrawSnapshotRound[];
  teams: Team[];
  judges: Judge[];
  venues: Venue[];
  eventPlan?: Project["eventPlan"];
  randomMeta?: Project["randomMeta"];
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
  drawHistory?: DrawSnapshot[];
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

export function appendDrawSnapshot(project: Project, action: DrawSnapshot["action"]): Project {
  const next = structuredClone(project);
  const snapshot: DrawSnapshot = {
    id: uid(),
    savedAt: new Date().toISOString(),
    action,
    rounds: project.rounds.map(round => ({
      id: round.id,
      no: round.no,
      createdAt: round.createdAt,
      timeSlot: round.timeSlot,
      bp: round.bp ? structuredClone(round.bp) : undefined,
      rooms: round.rooms.map(room => ({
        id: room.id,
        venueId: room.venueId,
        teamIds: [...room.teamIds],
        judges: structuredClone(room.judges),
      })),
    })),
    teams: structuredClone(project.teams),
    judges: structuredClone(project.judges),
    venues: structuredClone(project.venues),
    eventPlan: project.eventPlan ? structuredClone(project.eventPlan) : undefined,
    randomMeta: project.randomMeta ? structuredClone(project.randomMeta) : undefined,
  };
  next.drawHistory = [...(project.drawHistory ?? []), snapshot];
  return next;
}

export function renameDrawSnapshot(project: Project, snapshotId: string, name: string): Project {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("名称不能为空");
  const next = structuredClone(project);
  const snapshot = next.drawHistory?.find(item => item.id === snapshotId);
  if (!snapshot) throw new Error("找不到历史版本");
  snapshot.name = trimmed;
  return next;
}

export function restoreDrawSnapshot(project: Project, snapshotId: string): Project {
  if (hasAnyScores(project)) throw new Error("已有成绩或裁判评分，不能恢复对阵历史");
  const snapshot = project.drawHistory?.find(item => item.id === snapshotId);
  if (!snapshot) throw new Error("找不到历史版本");

  const teamIds = new Set(project.teams.map(team => team.id));
  const venueIds = new Set(project.venues.map(venue => venue.id));
  const judgeIds = new Set(project.judges.map(judge => judge.id));
  for (const round of snapshot.rounds) for (const room of round.rooms) {
    if (room.teamIds.some(id => !teamIds.has(id)) || !venueIds.has(room.venueId) || room.judges.some(judge => !judgeIds.has(judge.id))) {
      throw new Error("历史版本引用的队伍、裁判或场地已不存在，无法恢复");
    }
  }

  const next = structuredClone(project);
  next.rounds = structuredClone(snapshot.rounds).map(round => ({
    ...round,
    rooms: round.rooms.map(room => ({ ...room, results: [], ballots: [], drafts: [] })),
  }));
  next.randomMeta = snapshot.randomMeta ? structuredClone(snapshot.randomMeta) : undefined;
  next.eventPlan = snapshot.eventPlan ? structuredClone(snapshot.eventPlan) : undefined;
  return appendDrawSnapshot(next, "restored");
}

export function swapRoomJudgePanels(project: Project, roundId: string, firstRoomId: string, secondRoomId: string): Project {
  if (firstRoomId === secondRoomId) throw new Error("请选择两个不同赛场");
  const next = structuredClone(project);
  const round = next.rounds.find(item => item.id === roundId);
  const first = round?.rooms.find(room => room.id === firstRoomId);
  const second = round?.rooms.find(room => room.id === secondRoomId);
  if (!first || !second) throw new Error("找不到比赛场地");
  [first.judges, second.judges] = [second.judges, first.judges];
  return next;
}
