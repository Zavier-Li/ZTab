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
export function minimumAssignment(cost: number[][]) {
  const n = cost.length,
    m = cost[0]?.length ?? 0;
  if (m < n) throw new Error("裁判数量不足");
  const u = Array(n + 1).fill(0),
    v = Array(m + 1).fill(0),
    p = Array(m + 1).fill(0),
    way = Array(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const min = Array(m + 1).fill(Infinity),
      used = Array(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity,
        j1 = 0;
      for (let j = 1; j <= m; j++)
        if (!used[j]) {
          const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < min[j]) {
            min[j] = cur;
            way[j] = j0;
          }
          if (min[j] < delta) {
            delta = min[j];
            j1 = j;
          }
        }
      for (let j = 0; j <= m; j++)
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else min[j] -= delta;
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }
  const result = Array<number>(n);
  for (let j = 1; j <= m; j++) if (p[j]) result[p[j] - 1] = j - 1;
  return result;
}
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
    const maxMismatch = Math.max(available.length, round.rooms.length),
      ratingWeight = round.rooms.length * 8 + 1,
      conflictWeight =
        round.rooms.length * (maxMismatch * ratingWeight + 8) + 1;
    const cost = round.rooms.map((room, i) =>
      available.map(
        (j, k) =>
          judgeConflicts(
            j,
            room.teamIds.map((id) => p.teams.find((t) => t.id === id)!),
          ).length *
            conflictWeight +
          Math.abs(i - k) * ratingWeight +
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
export function generatePowerRound(p: Project): Round {
  if (p.randomMeta)
    throw new Error("四轮随机排程已生成，请在独立赛事中使用成绩配对");
  const no = (p.rounds.at(-1)?.no ?? 0) + 1;
  if (p.rounds.some((r) => !completeRound(r)))
    throw new Error("请先录入并保存全部前序轮次成绩");
  const active = p.teams.filter((t) => t.active);
  if (!active.length || active.length % 4)
    throw new Error("启用队伍数必须大于 0 且能被 4 整除");
  const venues = p.venues
    .filter((v) => v.active)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const n = active.length / 4;
  if (venues.length < n)
    throw new Error(`需要 ${n} 个启用场地，当前只有 ${venues.length} 个`);
  const ranks = teamStandings(p).filter((t) => t.active);
  let rooms: string[][] = [];
  if (no === 1) {
    let best = Infinity;
    for (let attempt = 0; attempt < 100; attempt++) {
      const ids = active.map((t) => t.id);
      for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ids[i], ids[j]] = [ids[j], ids[i]];
      }
      const candidate = Array.from({ length: n }, (_, i) =>
          ids.slice(i * 4, i * 4 + 4),
        ),
        penalty = candidate.reduce((s, r) => s + schoolPenalty(p, r), 0);
      if (penalty < best) {
        rooms = candidate;
        best = penalty;
        if (!best) break;
      }
    }
  } else if (no >= 2 && no <= 4) {
    const infos = ranks
      .map((t, i) => ({
        id: t.id,
        index: i,
        unused: history(p, t.id).flatMap((count, pos) => (count ? [] : [pos])),
      }))
      .sort((a, b) => a.unused.length - b.unused.length || a.index - b.index);
    if (
      infos.some((t) => !t.unused.length || history(p, t.id).some((c) => c > 1))
    )
      throw new Error(
        "前序辩位存在重复，无法保证第 2–4 轮辩位轮换，请先检查历史对阵",
      );
    const quotas = [n, n, n, n],
      forced = new Map<string, number>(),
      memo = new Set<string>();
    function search(i: number): boolean {
      if (i === infos.length) return true;
      const key = `${i}:${quotas}`;
      if (memo.has(key)) return false;
      for (const pos of [...infos[i].unused].sort(
        (a, b) => quotas[b] - quotas[a] || a - b,
      )) {
        if (!quotas[pos]) continue;
        quotas[pos]--;
        const possible = quotas.every(
          (q, k) =>
            infos.slice(i + 1).filter((t) => t.unused.includes(k)).length >= q,
        );
        if (possible) {
          forced.set(infos[i].id, pos);
          if (search(i + 1)) return true;
          forced.delete(infos[i].id);
        }
        quotas[pos]++;
      }
      memo.add(key);
      return false;
    }
    if (!search(0)) throw new Error("无法分配不重复的辩位，请检查历史对阵");
    const buckets = POSITIONS.map((_, pos) =>
      ranks.filter((t) => forced.get(t.id) === pos).map((t) => t.id),
    );
    rooms = Array.from({ length: n }, (_, i) => buckets.map((b) => b[i]));
    const roomScore = (room: string[]) => {
      const rr = room.map((id) => ranks.find((t) => t.id === id)!);
      return [
        Math.max(...rr.map((t) => t.points)) -
          Math.min(...rr.map((t) => t.points)),
        Math.max(...rr.map((t) => t.total)) -
          Math.min(...rr.map((t) => t.total)),
        Math.max(...room.map((id) => ranks.findIndex((t) => t.id === id))) -
          Math.min(...room.map((id) => ranks.findIndex((t) => t.id === id))),
        schoolPenalty(p, room),
      ];
    };
    for (let pass = 0; pass < 5; pass++) {
      let changed = false;
      for (let a = 0; a < n; a++)
        for (let b = a + 1; b < n; b++)
          for (let pos = 0; pos < 4; pos++) {
            const before = roomScore(rooms[a]).map(
              (s, i) => s + roomScore(rooms[b])[i],
            );
            [rooms[a][pos], rooms[b][pos]] = [rooms[b][pos], rooms[a][pos]];
            const after = roomScore(rooms[a]).map(
              (s, i) => s + roomScore(rooms[b])[i],
            );
            if (compare(after, before) < 0) changed = true;
            else
              [rooms[a][pos], rooms[b][pos]] = [rooms[b][pos], rooms[a][pos]];
          }
      if (!changed) break;
    }
  } else {
    rooms = Array.from({ length: n }, (_, i) =>
      ranks.slice(i * 4, i * 4 + 4).map((t) => t.id),
    );
    for (let pass = 0; pass < 5; pass++)
      for (let a = 0; a < n; a++)
        for (let b = a + 1; b < n; b++)
          for (let i = 0; i < 4; i++)
            for (let j = 0; j < 4; j++) {
              const x = ranks.find((t) => t.id === rooms[a][i])!,
                y = ranks.find((t) => t.id === rooms[b][j])!;
              if (x.points !== y.points || x.total !== y.total) continue;
              const before =
                schoolPenalty(p, rooms[a]) + schoolPenalty(p, rooms[b]);
              [rooms[a][i], rooms[b][j]] = [rooms[b][j], rooms[a][i]];
              if (
                schoolPenalty(p, rooms[a]) + schoolPenalty(p, rooms[b]) >=
                before
              )
                [rooms[a][i], rooms[b][j]] = [rooms[b][j], rooms[a][i]];
            }
  }
  if (no === 1 || no > 4)
    rooms = rooms.map(
      (room) =>
        permutations(room).sort((a, b) =>
          compare(positionScore(p, a), positionScore(p, b)),
        )[0],
    );
  const round: Round = {
    id: uid(),
    no,
    createdAt: new Date().toISOString(),
    rooms: rooms.map((teamIds, i) => ({
      id: uid(),
      venueId: venues[i].id,
      teamIds,
      judges: [],
      results: [],
    })),
  };
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
          errors.push(
            `${p.teams.find((t) => t.id === id)?.name} 重复担任 ${POSITIONS[pos]}`,
          );
      });
  }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}
