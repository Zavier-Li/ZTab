import { minimumAssignment } from './assignment';
export { minimumAssignment } from './assignment';
import { bpHistory, defineBPBrackets, generateBPRound } from './bp-pairing';
import {
  POSITIONS,
  uid,
  completeRound,
  type Project,
  type Team,
  type Judge,
  type Room,
  type Round,
} from "./types";
import { teamStandings } from "./standings";
export const normalizeSchool = (s: string) =>
  s
    .toLowerCase()
    .replace(/[\s\p{P}]/gu, "")
    .replace(/(教师|学生|老师|teacher|student)/gi, "");
export const schoolMatch = (a: string, b: string) =>
  !!normalizeSchool(a) && normalizeSchool(a) === normalizeSchool(b);
export function roundKeys(task: string) {
  const s = task.replace(/[－—–]/g, "-"),
    keys = new Set<number>();
  const stripped = s.replace(/(\d+)\s*-\s*(\d+)/g, (_, a, b) => {
    for (let i = Math.min(+a, +b); i <= Math.min(999, Math.max(+a, +b)); i++)
      keys.add(i);
    return "";
  });
  for (const m of stripped.matchAll(/\d+/g)) keys.add(+m[0]);
  return keys;
}
export const judgeAvailable = (j: Judge, no: number) =>
  j.active && (!j.workTask.trim() || roundKeys(j.workTask).has(no));
export function judgeConflicts(j: Judge, teams: Team[]) {
  return teams.flatMap((t) => [
    ...(schoolMatch(j.institution, t.institution)
      ? [`${j.name} 与 ${t.name} 同校`]
      : []),
    ...(j.conflictInstitutions.some((s) => schoolMatch(s, t.institution))
      ? [`${j.name} 回避学校 ${t.institution}`]
      : []),
    ...(j.conflictTeams.includes(t.id) ? [`${j.name} 回避队伍 ${t.name}`] : []),
  ]);
}
const compare = (a: number[], b: number[]) =>
  a.reduce((c, n, i) => c || n - b[i], 0);
function permutations<T>(a: T[]): T[][] {
  return a.length
    ? a.flatMap((t, i) =>
        permutations(a.filter((_, j) => j !== i)).map((r) => [t, ...r]),
      )
    : [[]];
}
function history(p: Project, id: string) {
  const h = [0, 0, 0, 0];
  for (const r of p.rounds)
    for (const room of r.rooms) {
      const i = room.teamIds.indexOf(id);
      if (i >= 0) h[i]++;
    }
  return h;
}
function positionScore(p: Project, ids: string[]) {
  const total = [0, 0, 0, 0, 0, 0, 0];
  ids.forEach((id, i) => {
    const h = history(p, id),
      after = [...h];
    after[i]++;
    total[0] += Number(h[i] > 0);
    total[1] += h[i];
    total[2] += Math.max(...after);
    total[3] += i % 2 === 0 ? h[0] + h[2] : h[1] + h[3];
    total[4] += i < 2 ? h[0] + h[1] : h[2] + h[3];
    total[5] += Math.abs(after[0] + after[2] - after[1] - after[3]);
    total[6] += Math.abs(after[0] + after[1] - after[2] - after[3]);
  });
  return total;
}
function schoolPenalty(p: Project, room: string[]) {
  let n = 0;
  for (let a = 0; a < 4; a++)
    for (let b = a + 1; b < 4; b++)
      if (
        schoolMatch(
          p.teams.find((t) => t.id === room[a])!.institution,
          p.teams.find((t) => t.id === room[b])!.institution,
        )
      )
        n++;
  return n;
}
// Rectangular Hungarian algorithm: globally minimizes conflict, strength mismatch, rating cost.
export function assignJudges(p: Project, round: Round) {
  let available = p.judges
    .filter((j) => judgeAvailable(j, round.no))
    .sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));
  const needed =
    round.rooms.length *
    (1 + p.settings.panelsPerRoom + Number(p.settings.assignTimer));
  if (available.length < needed)
    throw new Error(
      `第 ${round.no} 轮需要 ${needed} 名可用裁判，当前 ${available.length} 名；请检查启用状态及工作任务`,
    );
  for (let layer = 0; layer <= p.settings.panelsPerRoom; layer++) {
    const previous = p.rounds.filter(r => r.no < round.no);
    const exposure = round.rooms.map(room => available.map(j => room.teamIds.reduce((sum,id) => sum + previous.reduce((n,r) => n + r.rooms.filter(old => old.teamIds.includes(id) && old.judges.some(a => a.id === j.id && a.role !== 'Timer')).length,0) ** 2,0)));
    const maxExposure = Math.max(0,...exposure.flat());
    const maxMismatch = Math.max(available.length, round.rooms.length),
      ratingWeight = round.rooms.length * 8 + 1,
      historyWeight = round.rooms.length * (maxMismatch * ratingWeight + 8) + 1,
      conflictWeight = round.rooms.length * (maxExposure * historyWeight + maxMismatch * ratingWeight + 8) + 1;
    const cost = round.rooms.map((room, i) =>
      available.map(
        (j, k) =>
          judgeConflicts(
            j,
            room.teamIds.map((id) => p.teams.find((t) => t.id === id)!),
          ).length *
            conflictWeight +
          exposure[i][k] * historyWeight + Math.abs(i - k) * ratingWeight +
          9 -
          j.rating,
      ),
    );
    const assignments = minimumAssignment(cost);
    const used = new Set<string>();
    round.rooms.forEach((room, i) => {
      const j = available[assignments[i]];
      room.judges.push({ id: j.id, role: layer === 0 ? "Chair" : "Panel" });
      used.add(j.id);
    });
    available = available.filter((j) => !used.has(j.id));
  }
  if (p.settings.assignTimer)
    round.rooms.forEach((room) =>
      room.judges.push({ id: available.shift()!.id, role: "Timer" }),
    );
  return round;
}
export function generatePowerRound(p: Project, seed = crypto.getRandomValues(new Uint32Array(1))[0]): Round {
  const round = generateBPRound(p, seed);
  const plan = p.eventPlan?.judgePanels[round.no-1];
  if (plan) {
    for (const room of round.rooms) {
      const venue = p.eventPlan!.venueIds.indexOf(room.venueId);
      if (venue < 0 || !plan[venue]?.length) throw new Error('预设赛场缺少裁判安排');
      room.judges = plan[venue].map((id,i) => {
        if (!p.judges.some(j => j.id === id && judgeAvailable(j, round.no))) throw new Error('预设裁判不存在或本轮不可用');
        return {id, role:i === 0 ? 'Chair' as const : 'Panel' as const};
      });
    }
    return round;
  }
  return assignJudges(p, round);
}
export function validateDraw(p: Project, r: Round) {
  const showSchoolWarnings = p.randomMeta?.options?.schoolAvoidance!=='off' && new Set(p.teams.filter(t=>t.active).map(t=>normalizeSchool(t.institution)).filter(Boolean)).size >= 3;
  const errors: string[] = [],
    warnings: string[] = [];
  const ids = r.rooms.flatMap((room) => room.teamIds),
    venues = r.rooms.map((room) => room.venueId),
    judges = r.rooms.flatMap((room) => room.judges.map((j) => j.id));
  if (new Set(ids).size !== ids.length) errors.push("本轮存在重复出场队伍");
  if (new Set(venues).size !== venues.length) errors.push("本轮存在重复场地");
  if (new Set(judges).size !== judges.length) errors.push("本轮存在重复裁判");
  if (r.bp) {
    const before = bpHistory(p, r.no);
    const expected = defineBPBrackets(ids.map(id => before.points.get(id) ?? 0));
    if (JSON.stringify(expected.map(b => JSON.stringify(b)).sort()) !== JSON.stringify(r.bp.brackets.map(b => JSON.stringify(b)).sort())) errors.push('BP 积分池信息与历史成绩不一致');
    r.rooms.forEach((room,i) => {
      if (room.teamIds.some(id => !r.bp!.brackets[i]?.allowed.includes(before.points.get(id) ?? 0))) errors.push('队伍不属于本场 BP 积分池');
    });
  }
  for (const room of r.rooms) {
    if (room.teamIds.length !== 4) errors.push("每个赛场必须有四支队伍");
    if (!room.judges.some((j) => j.role === "Chair"))
      errors.push("赛场缺少主裁");
    if(room.judges.filter(j=>j.role==='Chair').length>1)errors.push("主裁必须恰好一位");
    if (!p.venues.some((v) => v.id === room.venueId)) errors.push("场地不存在");
    const teams = room.teamIds.map((id) => p.teams.find((t) => t.id === id));
    if (teams.some((t) => !t)) {
      errors.push("存在未知队伍");
      continue;
    }
    if (showSchoolWarnings && schoolPenalty(p, room.teamIds))
      (p.randomMeta?.options?.schoolAvoidance==='strict'?errors:warnings).push(
        `${p.venues.find((v) => v.id === room.venueId)?.name} 存在同校队伍`,
      );
    for (const a of room.judges) {
      const j = p.judges.find((j) => j.id === a.id);
      if (!j) {
        errors.push("裁判不存在");
        continue;
      }
      if (a.role !== "Timer")
        warnings.push(...judgeConflicts(j, teams as Team[]));
      if (!judgeAvailable(j, r.no))
        warnings.push(`${j.name} 的工作轮次不含本轮（可能为手动替补）`);
    }
    if (r.no >= 2 && r.no <= 4)
      room.teamIds.forEach((id, pos) => {
        if (
          p.rounds
            .filter((pr) => pr.no < r.no)
            .some((pr) => pr.rooms.some((rr) => rr.teamIds[pos] === id))
        )
          (r.bp ? warnings : errors).push(
            `${p.teams.find((t) => t.id === id)?.name} 重复担任 ${POSITIONS[pos]}`,
          );
      });
  }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}
