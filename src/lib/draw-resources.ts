import { PythonRandom } from './random-draw';
import { judgeConflicts } from './pairing';
import type { Project, Round } from './types';

const permutations = [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
const compare = (a: number[], b: number[]) => a.reduce((value,n,i) => value || n-b[i], 0);

// For the generated groups and the supplied panel plan, enumerate all 6^4
// room-to-venue assignments jointly. Explicit panel plans stay attached to
// their venues. Team groups and speaking positions are never changed.
export function optimizeDrawResources(p: Project, rounds: Round[], seed: number) {
  if (rounds.length !== 4 || rounds.some(r => r.rooms.length !== 3)) throw new Error('资源联合优化需要四轮、每轮三个赛场');
  const venueIds = rounds[0].rooms.map(room => room.venueId);
  const order = new PythonRandom(seed).shuffle(permutations);
  let bestScore: number[] | null = null, best: number[][] = [];
  const choices: number[][] = [];
  const fixedPanels = !!p.eventPlan;
  const panels = rounds.map((r,ri) => r.rooms.map((room,v) => fixedPanels
    ? (p.eventPlan!.judgePanels[ri]?.[v] ?? []).map((id,i) => ({id,role:i === 0 ? 'Chair' as const : 'Panel' as const}))
    : room.judges));
  const conflictCosts = rounds.map((r,ri) => r.rooms.map(room => venueIds.map((_,v) => {
    const judges = fixedPanels ? panels[ri][v] : room.judges;
    return judges.filter(j => j.role !== 'Timer').reduce((sum,j) => sum + judgeConflicts(p.judges.find(a => a.id === j.id)!, room.teamIds.map(id => p.teams.find(t => t.id === id)!)).length, 0);
  })));
  function evaluate() {
    const venueCounts = new Map<string, number[]>(), judgeCounts = new Map<string, Map<string,number>>();
    let conflicts = 0;
    rounds.forEach((round,r) => choices[r].forEach((group,v) => {
      const room = round.rooms[group]; conflicts += conflictCosts[r][group][v];
      for (const team of room.teamIds) {
        if (!venueCounts.has(team)) venueCounts.set(team,[0,0,0]);
        venueCounts.get(team)![v]++;
        if (!judgeCounts.has(team)) judgeCounts.set(team,new Map());
        for (const judge of (fixedPanels ? panels[r][v] : room.judges).filter(j => j.role !== 'Timer')) {
          const seen = judgeCounts.get(team)!; seen.set(judge.id,(seen.get(judge.id) ?? 0)+1);
        }
      }
    }));
    const venues = [...venueCounts.values()].flat(), judges = [...judgeCounts.values()].flatMap(counts => [...counts.values()]);
    const score = [conflicts, venues.reduce((s,n) => s+Math.max(0,n-2),0), Math.max(0,...judges), judges.reduce((s,n) => s+n*(n-1)/2,0), venues.reduce((s,n) => s+n*n,0)];
    if (!bestScore || compare(score,bestScore)<0) { bestScore = score; best = choices.map(c => [...c]); }
  }
  function search(round: number) {
    if (round === 4) { evaluate(); return; }
    for (const permutation of order) { choices[round] = permutation; search(round+1); }
  }
  search(0);
  rounds.forEach((round,r) => {
    const old = round.rooms;
    round.rooms = best[r].map((group,v) => ({...old[group], venueId:venueIds[v], judges:fixedPanels ? panels[r][v] : old[group].judges}));
  });
  const counts = new Map<string,Map<string,number>>();
  for (const round of rounds) for (const room of round.rooms) for (const id of room.teamIds) {
    if (!counts.has(id)) counts.set(id,new Map());
    const seen = counts.get(id)!; seen.set(room.venueId,(seen.get(room.venueId)??0)+1);
  }
  return {method:'exhaustive-room-permutations' as const, assignments:1296, venueMax:Math.max(...[...counts.values()].flatMap(c => [...c.values()])), judgeMax:bestScore![2], conflictCount:bestScore![0], cost:bestScore!};
}
