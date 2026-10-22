import { minimumAssignment } from './assignment';
import { normalizeInstitution, PythonRandom } from './random-draw';
import { completeRound, uid, type Project, type Round } from './types';

export interface BPBracket { level: number; allowed: number[] }

// Score pools remain flexible: a pull-up may enter any room in the upper
// pool, rather than being pinned to the last room or chosen by speaker score.
export function defineBPBrackets(points: number[]): BPBracket[] {
  if (!points.length || points.length % 4) throw new Error('启用队伍数必须大于 0 且能被 4 整除');
  const counts = new Map<number, number>();
  points.forEach(p => counts.set(p, (counts.get(p) ?? 0) + 1));
  const brackets: BPBracket[] = [];
  let count = 0, level = 0, allowed: number[] = [];
  const flush = () => {
    for (let i = 0; i < count / 4; i++) brackets.push({level, allowed: [...allowed]});
    count = 0; allowed = [];
  };
  for (const score of [...counts.keys()].sort((a,b) => b-a)) {
    let remaining = counts.get(score)!;
    const needed = (4 - count % 4) % 4;
    if (count && remaining > needed) {
      if (needed) { allowed.push(score); count += needed; remaining -= needed; }
      flush();
    }
    if (remaining) {
      if (!count) level = score;
      allowed.push(score); count += remaining;
    }
  }
  flush();
  return brackets;
}

export function bpHistory(p: Project, no: number) {
  const points = new Map(p.teams.map(t => [t.id, 0]));
  const positions = new Map(p.teams.map(t => [t.id, [0,0,0,0]]));
  const pullups = new Map(p.teams.map(t => [t.id, 0]));
  const meetings = new Map<string, number>();
  for (const round of [...p.rounds].filter(r => r.no < no).sort((a,b) => a.no-b.no)) {
    for (const room of round.rooms) {
      const top = Math.max(...room.teamIds.map(id => points.get(id) ?? 0));
      room.teamIds.forEach((id,pos) => {
        if ((points.get(id) ?? 0) < top) pullups.set(id, (pullups.get(id) ?? 0) + 1);
        positions.get(id)![pos]++;
      });
      for (let a=0;a<4;a++) for(let b=a+1;b<4;b++) {
        const key = pairKey(room.teamIds[a], room.teamIds[b]);
        meetings.set(key, (meetings.get(key) ?? 0) + 1);
      }
    }
    for (const room of round.rooms) for (const r of room.results) points.set(r.teamId, (points.get(r.teamId) ?? 0) + 4-r.rank);
  }
  return {points, positions, pullups, meetings};
}
const pairKey = (a: string, b: string) => JSON.stringify([a,b].sort());

export function bpPositionCost(history: number[], position: number) {
  const after = history.map((n,i) => n + Number(i === position));
  const n = after.reduce((a,b) => a+b, 0);
  const entropy = -after.reduce((sum, v) => v ? sum + v/n * Math.log2(v/n) : sum, 0);
  return Math.max(0, (2-entropy)*n) ** 4;
}

export function analyzeBPRound(p: Project, round: Round) {
  const h = bpHistory(p, round.no);
  let positionCost = 0, priorPullupCost = 0, repeatedPairs = 0;
  const pullups: string[] = [], repeatPositionTeams: string[] = [];
  for (const [i, room] of round.rooms.entries()) {
    const level = round.bp?.brackets[i]?.level ?? Math.max(...room.teamIds.map(id => h.points.get(id) ?? 0));
    const actualTop = Math.max(...room.teamIds.map(id => h.points.get(id) ?? 0));
    room.teamIds.forEach((id,pos) => {
      positionCost += bpPositionCost(h.positions.get(id)!, pos);
      if ((h.points.get(id) ?? 0) < level) priorPullupCost += h.pullups.get(id) ?? 0;
      if ((h.points.get(id) ?? 0) < actualTop) pullups.push(id);
      if (h.positions.get(id)![pos]) repeatPositionTeams.push(id);
    });
    for (let a=0;a<4;a++) for(let b=a+1;b<4;b++) if (h.meetings.has(pairKey(room.teamIds[a], room.teamIds[b]))) repeatedPairs++;
  }
  return {pullups, positionCost, priorPullupCost, repeatedPairs, repeatPositionTeams};
}

export function generateBPRound(p: Project, seed: number): Round {
  if (p.randomMeta) throw new Error('四轮随机排程已生成，请在独立赛事中使用成绩配对');
  const no = Math.max(0, ...p.rounds.map(r => r.no)) + 1;
  if (p.rounds.some(r => !completeRound(r))) throw new Error('请先录入并保存全部前序轮次成绩');
  if (p.rounds.some(r => r.rooms.some(room => room.drafts?.some(d => d.judgeId === 'official')))) throw new Error('请先确认前序轮次的正式成绩草稿');
  if (no > (p.settings.preliminaryRounds ?? 4)) throw new Error('全部预赛轮次已生成');
  const teams = p.teams.filter(t => t.active);
  const rng = new PythonRandom(seed), h = bpHistory(p, no);
  const brackets = defineBPBrackets(teams.map(t => h.points.get(t.id) ?? 0));
  const venues = p.venues.filter(v => v.active).sort((a,b) => a.name.localeCompare(b.name, undefined, {numeric:true}));
  if (venues.length < brackets.length) throw new Error(`需要 ${brackets.length} 个启用场地，当前只有 ${venues.length} 个`);
  const positionBound = teams.reduce((sum,t) => sum + Math.max(...[0,1,2,3].map(pos => bpPositionCost(h.positions.get(t.id)!,pos))), 0);
  const pullupWeight = positionBound + 1;
  const maxCost = positionBound + pullupWeight * teams.reduce((sum,t) => sum + (h.pullups.get(t.id) ?? 0), 0) + 1;
  const forbidden = (maxCost + 1) * (teams.length + 1);
  const costs = teams.map(t => brackets.flatMap(bracket => [0,1,2,3].map(pos => bracket.allowed.includes(h.points.get(t.id) ?? 0)
    ? bpPositionCost(h.positions.get(t.id)!,pos) + ((h.points.get(t.id) ?? 0) < bracket.level ? (h.pullups.get(t.id) ?? 0) * pullupWeight : 0)
    : forbidden)));
  const schools = new Map(teams.map(t => [t.id, normalizeInstitution(t.institution)]));
  const schoolActive = new Set([...schools.values()].filter(Boolean)).size >= 3;
  let best: string[][] = [], bestCost = Infinity, bestSecondary = [Infinity,Infinity,Infinity];
  // All samples solve the same primary assignment optimally. History only
  // selects between equal-cost assignments; it cannot override score pools,
  // fair pull-ups or position balance.
  for (let sample=0;sample<64;sample++) {
    const rows = rng.shuffle(teams.map((_,i) => i));
    const columns = rng.shuffle(teams.map((_,i) => i));
    const assignment = minimumAssignment(rows.map(i => columns.map(j => costs[i][j])));
    const rooms = brackets.map(() => Array<string>(4));
    let cost = 0, repeats = 0, thirds = 0, schoolPairs = 0;
    rows.forEach((team,i) => {
      const slot = columns[assignment[i]];
      if (costs[team][slot] >= forbidden) throw new Error('无法完成 BP 积分池匹配');
      rooms[Math.floor(slot/4)][slot%4] = teams[team].id;
      cost += costs[team][slot];
    });
    for (const room of rooms) for(let a=0;a<4;a++) for(let b=a+1;b<4;b++) {
      const prior = h.meetings.get(pairKey(room[a],room[b])) ?? 0;
      repeats += prior ** 2; thirds += Number(prior >= 2);
      if (schoolActive && schools.get(room[a]) && schools.get(room[a]) === schools.get(room[b])) schoolPairs++;
    }
    const secondary = [thirds,repeats,schoolPairs];
    const betterSecondary = secondary.reduce((cmp,n,i) => cmp || n-bestSecondary[i], 0) < 0;
    if (cost < bestCost-1e-6 || Math.abs(cost-bestCost)<1e-6 && betterSecondary) { best = rooms; bestCost = cost; bestSecondary = secondary; }
  }
  const venueOrder = rng.shuffle(venues);
  const venueCosts = best.map(room => venueOrder.map(v => room.reduce((sum,id) => sum + p.rounds.filter(r => r.no < no).reduce((n,r) => n + Number(r.rooms.some(old => old.venueId === v.id && old.teamIds.includes(id))),0) ** 2,0)));
  const venueAssignment = minimumAssignment(venueCosts);
  const round: Round = {id:uid(), no, createdAt:new Date().toISOString(), timeSlot:p.eventPlan?.timeSlots[no-1], rooms:best.map((teamIds,i) => ({id:uid(), venueId:venueOrder[venueAssignment[i]].id, teamIds, judges:[], results:[]}))};
  round.bp = {version:1, seed, brackets, pullups:[], positionCost:0, priorPullupCost:0, repeatedPairs:0, repeatPositionTeams:[]};
  Object.assign(round.bp, analyzeBPRound(p, round));
  return round;
}
