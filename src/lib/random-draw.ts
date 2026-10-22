// Python random.Random integer seeding and MT19937, for reproducible script parity.
export class PythonRandom {
  private mt = new Uint32Array(624);
  private index = 624;
  constructor(seed: number) {
    if (!Number.isSafeInteger(seed) || seed < 0)
      throw new Error("种子必须是非负安全整数");
    const keys = [seed >>> 0];
    if (seed > 0xffffffff) keys.push(Math.floor(seed / 4294967296) >>> 0);
    this.mt[0] = 19650218;
    for (let i = 1; i < 624; i++)
      this.mt[i] =
        (Math.imul(1812433253, this.mt[i - 1] ^ (this.mt[i - 1] >>> 30)) +
          i) >>>
        0;
    let i = 1,
      j = 0;
    for (let k = Math.max(624, keys.length); k; k--) {
      this.mt[i] =
        ((this.mt[i] ^
          Math.imul(this.mt[i - 1] ^ (this.mt[i - 1] >>> 30), 1664525)) +
          keys[j] +
          j) >>>
        0;
      if (++i >= 624) {
        this.mt[0] = this.mt[623];
        i = 1;
      }
      if (++j >= keys.length) j = 0;
    }
    for (let k = 623; k; k--) {
      this.mt[i] =
        ((this.mt[i] ^
          Math.imul(this.mt[i - 1] ^ (this.mt[i - 1] >>> 30), 1566083941)) -
          i) >>>
        0;
      if (++i >= 624) {
        this.mt[0] = this.mt[623];
        i = 1;
      }
    }
    this.mt[0] = 0x80000000;
  }
  uint() {
    if (this.index >= 624) {
      for (let i = 0; i < 624; i++) {
        const y =
          (this.mt[i] & 0x80000000) | (this.mt[(i + 1) % 624] & 0x7fffffff);
        this.mt[i] =
          this.mt[(i + 397) % 624] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
      }
      this.index = 0;
    }
    let y = this.mt[this.index++];
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }
  random() {
    return (
      ((this.uint() >>> 5) * 67108864 + (this.uint() >>> 6)) / 9007199254740992
    );
  }
  below(n: number) {
    const k = Math.floor(Math.log2(n)) + 1;
    let r = this.uint() >>> (32 - k);
    while (r >= n) r = this.uint() >>> (32 - k);
    return r;
  }
  shuffle<T>(a: T[]) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.below(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  sample3() {
    const pool = [0, 1, 2];
    let j = this.below(3);
    const a = pool[j];
    pool[j] = pool[2];
    j = this.below(2);
    return [a, pool[j]];
  }
}
export type Draws = number[][][];
export interface DrawOptions {maxMeetings:number;schoolAvoidance:'off'|'prefer'|'strict';schoolThreshold:number;searchDepth:'standard'|'deep'}
export const defaultDrawOptions:DrawOptions={maxMeetings:2,schoolAvoidance:'prefer',schoolThreshold:3,searchDepth:'standard'};
const normalizeInstitution=(s:string)=>s.toLowerCase().replace(/[\s\p{P}]/gu,'').replace(/(教师|学生|老师|teacher|student)/gi,'');
export function schoolCollisions(draws:Draws,institutions:string[]){const schools=institutions.map(normalizeInstitution);let count=0;for(const round of draws)for(const room of round)for(let a=0;a<4;a++)for(let b=a+1;b<4;b++)if(schools[room[a]]&&schools[room[a]]===schools[room[b]])count++;return count}
export function validateDrawOptions(options:DrawOptions,institutions:string[]){if(!Number.isInteger(options.maxMeetings)||options.maxMeetings<1||options.maxMeetings>4)throw new Error('最多交手次数必须为 1–4 的整数');if(options.maxMeetings===1)throw new Error('12 支队伍打四轮，每队需要 12 次对手席位，但只有 11 个不同对手，最多交手 1 次无解');if(!Number.isInteger(options.schoolThreshold)||options.schoolThreshold<3||options.schoolThreshold>12)throw new Error('同校回避启用学校数须为 3–12 的整数');if(!['off','prefer','strict'].includes(options.schoolAvoidance)||!['standard','deep'].includes(options.searchDepth))throw new Error('随机排程参数无效');const schools=institutions.map(normalizeInstitution).filter(Boolean);if(new Set(schools).size>=options.schoolThreshold&&options.schoolAvoidance==='strict'&&schools.some(s=>schools.filter(x=>x===s).length>3))throw new Error('严格同校回避无解：同一学校超过 3 支队伍，但每轮只有 3 个赛场')}
export interface DrawReport {
  distinct_pairs: number;
  repeated_pairs: number;
  max_pair_meetings: number;
  teams: { name: string; roles: string[]; distinct_opponents: number }[];
}
export function pairCounts(draws: Draws) {
  const counts = new Uint8Array(144);
  for (const rooms of draws)
    for (const room of rooms)
      for (let a = 0; a < 4; a++)
        for (let b = a + 1; b < 4; b++) {
          const x = Math.min(room[a], room[b]),
            y = Math.max(room[a], room[b]);
          counts[x * 12 + y]++;
        }
  return counts;
}
export function scheduleScore(draws: Draws,options:DrawOptions=defaultDrawOptions,institutions:string[]=[]) {
  const counts = pairCounts(draws),
    opponents = new Uint8Array(12);
  let distinct = 0,
    excess = 0;
  for (let a = 0; a < 12; a++)
    for (let b = a + 1; b < 12; b++) {
      const n = counts[a * 12 + b];
      if (n) {
        distinct++;
        opponents[a]++;
        opponents[b]++;
        excess += Math.max(0, n - options.maxMeetings);
      }
    }
  return (
    100 * (72 - distinct) +
    10 * opponents.reduce((s, n) => s + (n - 9) ** 2, 0) +
    1000 * excess + (new Set(institutions.map(normalizeInstitution).filter(Boolean)).size>=options.schoolThreshold&&options.schoolAvoidance!=='off'?schoolCollisions(draws,institutions)*(options.schoolAvoidance==='strict'?100000:20):0)
  );
}
export function optimizeGroups(
  seed: number,
  progress?: (n: number) => void,
  options:DrawOptions=defaultDrawOptions,
  institutions:string[]=[],
): Draws {
  validateDrawOptions(options,institutions);
  const rng = new PythonRandom(seed);
  let best: Draws | null = null,
    bestScore = Infinity;
  const attempts=options.searchDepth==='deep'?120:40;
  for (let restart = 0; restart < attempts; restart++) {
    const rounds = Array.from({ length: 4 }, () => {
      const ids = rng.shuffle(Array.from({ length: 12 }, (_, i) => i));
      return [ids.slice(0, 4), ids.slice(4, 8), ids.slice(8, 12)];
    });
    if(options.schoolAvoidance==='strict'&&new Set(institutions.map(normalizeInstitution).filter(Boolean)).size>=options.schoolThreshold){for(let retry=0;schoolCollisions([rounds[0]],institutions)&&retry<500;retry++){const ids=rng.shuffle(Array.from({length:12},(_,i)=>i));rounds[0]=[ids.slice(0,4),ids.slice(4,8),ids.slice(8,12)]}}
    let current = scheduleScore(rounds,options,institutions);
    for (let iteration = 0; iteration < 12000; iteration++) {
      const r = 1 + rng.below(3),
        [a, b] = rng.sample3(),
        i = rng.below(4),
        j = rng.below(4);
      [rounds[r][a][i], rounds[r][b][j]] = [rounds[r][b][j], rounds[r][a][i]];
      const candidate = scheduleScore(rounds,options,institutions),
        temperature = Math.max(2, 90 * (1 - iteration / 12000));
      if (
        candidate <= current ||
        rng.random() < Math.exp((current - candidate) / temperature)
      )
        current = candidate;
      else
        [rounds[r][a][i], rounds[r][b][j]] = [rounds[r][b][j], rounds[r][a][i]];
      if (current < bestScore) {
        bestScore = current;
        best = structuredClone(rounds);
        if (current === 1800) return best;
      }
    }
    progress?.((restart + 1) / attempts);
  }
  if (!best || Math.max(...pairCounts(best)) > options.maxMeetings)
    throw new Error('未找到满足交手次数上限的排程，请更换种子或增加搜索强度');
  if(options.schoolAvoidance==='strict'&&new Set(institutions.map(normalizeInstitution).filter(Boolean)).size>=options.schoolThreshold&&schoolCollisions(best,institutions))throw new Error('未找到满足严格同校回避的排程，请更换种子或增加搜索强度');
  return best;
}
export function assignRoles(groups: Draws): Draws {
  const rooms = groups.flat().map((r) => new Set(r)),
    assignments = rooms.map(() => Array<number>(4));
  for (let role = 0; role < 4; role++) {
    const matched = new Map<number, number>();
    function augment(team: number, visited: Set<number>): boolean {
      for (let room = 0; room < rooms.length; room++) {
        if (!rooms[room].has(team) || visited.has(room)) continue;
        visited.add(room);
        if (!matched.has(room) || augment(matched.get(room)!, visited)) {
          matched.set(room, team);
          return true;
        }
      }
      return false;
    }
    for (let team = 0; team < 12; team++)
      if (!augment(team, new Set())) throw new Error("辩位二分图匹配失败");
    for (const [room, team] of matched) {
      assignments[room][role] = team;
      rooms[room].delete(team);
    }
  }
  return Array.from({ length: 4 }, (_, i) =>
    assignments.slice(i * 3, i * 3 + 3),
  );
}
function permutations<T>(a: T[]): T[][] {
  return a.length
    ? a.flatMap((x, i) =>
        permutations(a.filter((_, j) => i !== j)).map((rest) => [x, ...rest]),
      )
    : [[]];
}
export function adjustDraws(original: Draws, names: string[]) {
  const baseline = [0, 2, 1, 3].map((r) =>
    original[r].map((room) => [...room]),
  );
  const star = names.findIndex((n) => n.toLowerCase() === "star star"),
    heriot = names.findIndex((n) => n.toLowerCase() === "heriot watt"),
    needle = names.indexOf("针锋相队");
  if ([star, heriot, needle].includes(-1))
    throw new Error(
      "原脚本调整需要 Star Star、heriot watt、针锋相队，请选择独立随机模式或导入对应报名表",
    );
  const rooms = baseline.flat(),
    options = rooms.map((room, index) =>
      permutations(room)
        .filter(
          (c) =>
            (!room.includes(star) || c.indexOf(star) === room.indexOf(star)) &&
            (!(index < 3 && room.includes(heriot)) || c[0] === heriot),
        )
        .map((candidate) => ({
          cost: room.reduce((s, t, i) => s + Number(t !== candidate[i]), 0),
          candidate,
        }))
        .sort(
          (a, b) =>
            a.cost - b.cost ||
            a.candidate.reduce((v, n, i) => v || n - b.candidate[i], 0),
        ),
    );
  let bestCost = 49,
    best: number[][] | null = null;
  const used = new Uint8Array(12),
    assigned = new Map<number, number[]>();
  function search(cost: number) {
    if (assigned.size === 12) {
      bestCost = cost;
      best = Array.from({ length: 12 }, (_, i) => [...assigned.get(i)!]);
      return;
    }
    const available = new Map<number, (typeof options)[number]>();
    let lower = cost;
    for (let i = 0; i < 12; i++) {
      if (assigned.has(i)) continue;
      const candidates = options[i].filter((o) =>
        o.candidate.every((team, role) => !(used[team] & (1 << role))),
      );
      if (!candidates.length) return;
      available.set(i, candidates);
      lower += candidates[0].cost;
    }
    if (lower >= bestCost) return;
    const index = [...available.keys()].sort(
      (a, b) => available.get(a)!.length - available.get(b)!.length || a - b,
    )[0];
    for (const { cost: extra, candidate } of available.get(index)!) {
      if (cost + extra >= bestCost) continue;
      assigned.set(index, candidate);
      candidate.forEach((t, r) => (used[t] |= 1 << r));
      search(cost + extra);
      candidate.forEach((t, r) => (used[t] ^= 1 << r));
      assigned.delete(index);
    }
  }
  search(0);
  if (!best) throw new Error("无法同时满足原脚本固定辩位与轮换要求");
  const draws = Array.from({ length: 4 }, (_, i) =>
    (best as number[][]).slice(i * 3, i * 3 + 3),
  );
  const location = (t: number) => {
    for (let v = 0; v < 3; v++) {
      const role = draws[2][v].indexOf(t);
      if (role >= 0) return [v, role];
    }
    throw new Error("队伍位置缺失");
  };
  const [a, ra] = location(needle),
    [b, rb] = location(heriot);
  if (ra !== rb)
    throw new Error(
      "原脚本第三轮换队将破坏辩位轮换，请更换种子或使用独立随机模式",
    );
  [draws[2][a][ra], draws[2][b][rb]] = [draws[2][b][rb], draws[2][a][ra]];
  [draws[3][1], draws[3][2]] = [draws[3][2], draws[3][1]];
  return { draws, baseline, changed: bestCost };
}
export function validateSchedule(draws: Draws, names: string[]): DrawReport {
  if (names.length !== 12 || new Set(names).size !== 12 || draws.length !== 4)
    throw new Error("四轮随机编排需要恰好 12 支不同队伍及 4 轮对阵");
  const roles = names.map(() => [] as string[]),
    opponents = names.map(() => new Set<number>());
  for (const rooms of draws) {
    if (
      rooms.length !== 3 ||
      rooms.some((r) => r.length !== 4) ||
      rooms
        .flat()
        .sort((a, b) => a - b)
        .join() !== Array.from({ length: 12 }, (_, i) => i).join()
    )
      throw new Error("每轮必须包含 3 个赛场，12 支队伍各上场一次");
    for (const room of rooms)
      room.forEach((t, r) => {
        roles[t].push(["OG", "OO", "CG", "CO"][r]);
        room.forEach((o) => {
          if (o !== t) opponents[t].add(o);
        });
      });
  }
  if (roles.some((r) => new Set(r).size !== 4))
    throw new Error("每队必须分别担任一次 OG、OO、CG、CO");
  const counts = [...pairCounts(draws)].filter(Boolean);
  return {
    distinct_pairs: counts.length,
    repeated_pairs: counts.filter((n) => n > 1).length,
    max_pair_meetings: Math.max(...counts),
    teams: names.map((name, i) => ({
      name,
      roles: roles[i],
      distinct_opponents: opponents[i].size,
    })),
  };
}
export function generateRandomDraw(
  seed: number,
  names: string[],
  mode: "random-new" | "adjusted",
  progress?: (n: number) => void,
  options:DrawOptions=defaultDrawOptions,
  institutions:string[]=[],
) {
  const original = assignRoles(optimizeGroups(seed, progress,options,institutions));
  const adjusted =
    mode === "adjusted"
      ? adjustDraws(original, names)
      : { draws: original, baseline: null, changed: 0 };
  const report = validateSchedule(adjusted.draws, names);
  if (report.max_pair_meetings > options.maxMeetings)
    throw new Error('调整后交手次数超过设定上限，请更换种子或使用独立随机模式');
  if(options.schoolAvoidance==='strict'&&new Set(institutions.map(normalizeInstitution).filter(Boolean)).size>=options.schoolThreshold&&schoolCollisions(adjusted.draws,institutions))throw new Error('原脚本调整破坏了严格同校回避，请使用独立随机模式');
  return { ...adjusted, original, report, seed, mode,options };
}
