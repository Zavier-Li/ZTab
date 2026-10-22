import {
  newProject,
  uid,
  POSITIONS,
  type Project,
  type Team,
  type Judge,
} from "./types";
import { validateResults } from "./standings";
import { validateDraw } from "./pairing";
import { validateSchedule, type Draws, type DrawOptions } from "./random-draw";
type RecordRow = Record<string, unknown>;
const normalized = (s: string) =>
  s.toLowerCase().replace(/（.*?）|\(.*?\)|[\s_\-/]/g, "");
export function value(row: RecordRow, keys: string[], fallback = "") {
  for (const [k, v] of Object.entries(row))
    if (
      keys.map(normalized).includes(normalized(k)) &&
      v !== null &&
      v !== undefined &&
      String(v).trim()
    )
      return String(v).trim();
  return fallback;
}
const yes = (s: string) =>
  ["1", "yes", "true", "y", "sl", "是"].includes(s.toLowerCase());
function uniqueNames(items: { name: string }[]) {
  if (items.some((t) => !t.name.trim())) throw new Error("名称不能为空");
  const names = items.map((t) => t.name.trim().toLowerCase());
  if (new Set(names).size !== names.length)
    throw new Error("导入文件存在重复名称，请先处理重复行");
}
export async function readRecords(file: File): Promise<RecordRow[]> {
  const XLSX = await import("xlsx");
  const data = await file.arrayBuffer();
  const w = file.name.toLowerCase().endsWith(".csv")
    ? XLSX.read(new TextDecoder("utf-8").decode(data), { type: "string" })
    : XLSX.read(data, { type: "array" });
  if (!w.SheetNames.length) throw new Error("文件没有工作表");
  return XLSX.utils.sheet_to_json<RecordRow>(w.Sheets[w.SheetNames[0]], {
    defval: "",
    raw: false,
  });
}
export function parseTeams(rows: RecordRow[]): Team[] {
  let institution = "";
  const result = rows
    .filter((r) => Object.values(r).some((v) => String(v ?? "").trim()))
    .map((row) => {
      institution = value(
        row,
        [
          "institution",
          "school",
          "university",
          "学校",
          "学校名称",
          "学校/单位",
          "所属学校",
          "院校",
          "单位",
          "机构",
        ],
        institution,
      );
      const name = value(row, [
        "team name",
        "team",
        "teamname",
        "team title",
        "队名",
        "队伍",
        "队伍名称",
        "参赛队伍",
      ]);
      if (!name) throw new Error("存在缺少队名的行，请检查首行表头");
      return {
        id: uid(),
        name,
        speaker1: value(row, [
          "speaker1",
          "speaker one",
          "debater1",
          "first debater",
          "辩手1",
          "辩手一",
          "一辩",
          "队员1姓名",
        ]),
        speaker2: value(row, [
          "speaker2",
          "speaker two",
          "debater2",
          "second debater",
          "辩手2",
          "辩手二",
          "二辩",
          "队员2姓名",
        ]),
        institution,
        secondLanguage: yes(
          value(row, ["second language", "sl", "第二语言", "二语"]),
        ),
        active: true,
      };
    });
  if (!result.length) throw new Error("没有可导入的队伍");
  uniqueNames(result);
  return result;
}
export function parseJudges(rows: RecordRow[]): Judge[] {
  const result = rows.map((row) => {
    const name = value(row, [
        "name",
        "adjudicator",
        "judge",
        "姓名",
        "裁判",
        "裁判姓名",
        "评委",
        "评委姓名",
      ]),
      institution = value(row, [
        "institution",
        "school",
        "university",
        "学校",
        "学校名称",
        "学校/单位",
        "院校",
        "单位",
        "机构",
      ]);
    const ratingText = value(row, [
      "rating",
      "rank",
      "level",
      "等级",
      "级别",
      "裁判等级",
    ]);
    const identity = value(row, ["身份", "identity", "status", "type"]);
    const rating = ratingText
      ? Number(ratingText)
      : /教师|teacher|老师/i.test(identity + institution)
        ? 7
        : 3;
    if (!Number.isInteger(rating) || rating < 1 || rating > 9)
      throw new Error(`${name} 的裁判等级必须为 1–9 的整数`);
    return {
      id: uid(),
      name,
      institution,
      rating,
      active: true,
      workTask: value(row, [
        "work task",
        "task",
        "工作任务",
        "任务",
        "负责轮次",
        "评审轮次",
      ]),
      workTime: value(row, ["work time", "time", "工作时间", "时间"]),
      conflictInstitutions: [],
      conflictTeams: [],
    };
  });
  if (!result.length) throw new Error("没有可导入的裁判");
  uniqueNames(result);
  return result;
}
export function validateProject(input: unknown): Project {
  if (!input || typeof input !== "object") throw new Error("无效的项目 JSON");
  const p = input as Project;
  if (
    typeof p.name !== "string" ||
    !p.name.trim() ||
    !Array.isArray(p.teams) ||
    !Array.isArray(p.judges) ||
    !Array.isArray(p.venues) ||
    !Array.isArray(p.rounds) ||
    !p.settings
  )
    throw new Error("项目缺少必要字段");
  for (const collection of [p.teams, p.judges, p.venues, p.rounds]) {
    if (
      collection.some((t) => typeof t.id !== "string") ||
      new Set(collection.map((t) => t.id)).size !== collection.length
    )
      throw new Error("数据中存在无效或重复 ID");
  }
  uniqueNames(p.teams);
  uniqueNames(p.judges);
  uniqueNames(p.venues);
  for (const t of p.teams)
    if (
      !["name", "speaker1", "speaker2", "institution"].every(
        (k) => typeof t[k as keyof Team] === "string",
      ) ||
      typeof t.active !== "boolean" ||
      typeof t.secondLanguage !== "boolean" || (t.isStrong !== undefined && typeof t.isStrong !== "boolean")
    )
      throw new Error("队伍字段格式不正确");
  for (const j of p.judges)
    if (
      !["name", "institution", "workTask", "workTime"].every(
        (k) => typeof j[k as keyof Judge] === "string",
      ) ||
      typeof j.active !== "boolean" ||
      !Number.isInteger(j.rating) ||
      j.rating < 1 ||
      j.rating > 9 ||
      !Array.isArray(j.conflictInstitutions) ||
      j.conflictInstitutions.some((s) => typeof s !== "string") ||
      !Array.isArray(j.conflictTeams) ||
      j.conflictTeams.some((id) => !p.teams.some((t) => t.id === id))
    )
      throw new Error("裁判或回避信息格式不正确");
  if (p.venues.some((v) => typeof v.active !== "boolean"))
    throw new Error("场地状态格式不正确");
  if (
    !Number.isInteger(p.settings.panelsPerRoom) ||
    p.settings.panelsPerRoom < 0 ||
    p.settings.panelsPerRoom > 10 ||
    typeof p.settings.assignTimer !== "boolean" ||
    p.settings.preliminaryRounds !== undefined && (!Number.isInteger(p.settings.preliminaryRounds) || p.settings.preliminaryRounds < 1 || p.settings.preliminaryRounds > 24)
  )
    throw new Error("赛事设置格式不正确");
  const roundNos = p.rounds.map((r) => r.no);
  if (
    new Set(roundNos).size !== roundNos.length ||
    roundNos.some((n) => !Number.isInteger(n) || n < 1)
  )
    throw new Error("轮次编号无效或重复");
  for (const r of p.rounds) {
    if (!Array.isArray(r.rooms) || !r.rooms.length)
      throw new Error("轮次缺少赛场");
    if (r.bp && (r.bp.version !== 1 || !Number.isSafeInteger(r.bp.seed) || r.bp.seed < 0 || !Array.isArray(r.bp.brackets) || r.bp.brackets.length !== r.rooms.length || r.bp.brackets.some(b => !Number.isInteger(b.level) || !Array.isArray(b.allowed) || !b.allowed.length || b.allowed.some(n => !Number.isInteger(n) || n < 0)))) throw new Error('BP 编排信息格式不正确');
    for (const room of r.rooms) {
      if (
        !Array.isArray(room.teamIds) ||
        !Array.isArray(room.judges) ||
        !Array.isArray(room.results)
      )
        throw new Error("对阵格式错误");
      if (
        room.judges.some((j) => !["Chair", "Panel", "Timer"].includes(j.role))
      )
        throw new Error("裁判角色格式错误");
      if (room.results.length) validateResults(room.teamIds, room.results);
    }
    for (const room of r.rooms) {
      for (const draft of room.drafts ?? []) {
        if (typeof draft.judgeId !== 'string' || typeof draft.quick !== 'string' ||
          ![draft.ranks, draft.score1, draft.score2].every(values => Array.isArray(values) && values.length === 4 && values.every(v => typeof v === 'string')) ||
          (draft.judgeId !== 'official' && !room.judges.some(j => j.id === draft.judgeId && j.role !== 'Timer')))
          throw new Error("评分草稿格式错误");
      }
      for (const b of room.ballots ?? []) {
        if (!room.judges.some((j) => j.id === b.judgeId && j.role !== "Timer"))
          throw new Error("裁判评分引用未分配的裁判");
        validateResults(room.teamIds, b.results);
      }
    }
    const errors = validateDraw(p, r).errors.filter(
      (e) => e !== "赛场缺少主裁",
    );
    if (errors.length) throw new Error(`第 ${r.no} 轮：${errors.join("；")}`);
  }
  if (p.randomMeta) {
    const { teamOrder } = p.randomMeta;
    if (
      !Array.isArray(teamOrder) ||
      teamOrder.length < 4 || teamOrder.length % 4 !== 0 ||
      new Set(teamOrder).size !== teamOrder.length ||
      teamOrder.some((id) => !p.teams.some((t) => t.id === id))
    )
      throw new Error("随机排程队伍顺序不正确");
    const draws = p.rounds.map((r) =>
      r.rooms.map((room) => room.teamIds.map((id) => teamOrder.indexOf(id))),
    );
    const report = validateSchedule(
      draws,
      teamOrder.map((id) => p.teams.find((t) => t.id === id)!.name),
      teamOrder.map(id => !!p.randomMeta?.strongTeamIds?.includes(id)), p.randomMeta.options?.maxMeetings ?? 2,
    );
    if (report.max_pair_meetings > (p.randomMeta.options?.maxMeetings??2))
      throw new Error("交手次数超过设定上限");
  }
  return p;
}
export async function importBackup(file: File): Promise<Project> {
  if (file.name.toLowerCase().endsWith(".db")) return importSQLite(file);
  const raw = JSON.parse(await file.text());
  if (raw.format === "ztab" && raw.version !== 1)
    throw new Error("不支持此备份版本");
  if (Array.isArray(raw.draws) && Array.isArray(raw.teams) && !raw.project)
    return importSchedule(raw);
  const p = validateProject(raw.project ?? raw);
  return {
    ...p,
    id: uid(),
    name: `${p.name} · 导入`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
function importSchedule(raw: {
  teams: { name: string; speaker1?: string; speaker2?: string; isStrong?: boolean }[];
  draws: Draws;
  venues?: string[];
  round_venues?: string[][];
  seed?: number;
  mode?: string;
  original_draws?: Draws;
  swapped_baseline?: Draws;
  changed_role_slots?: number;
  options?:DrawOptions;
}) {
  const report = validateSchedule(
    raw.draws,
    raw.teams.map((t) => t.name), raw.teams.map(t => !!t.isStrong), raw.options?.maxMeetings ?? 2,
  );
  if (report.max_pair_meetings > (raw.options?.maxMeetings??2)) throw new Error("交手次数超过设定上限");
  const p = newProject("导入四轮随机排程");
  p.teams = raw.teams.map((t) => ({
    id: uid(),
    name: t.name,
    speaker1: t.speaker1 ?? "",
    speaker2: t.speaker2 ?? "",
    isStrong: !!t.isStrong,
    institution: "",
    secondLanguage: false,
    active: true,
  }));
  p.venues = (raw.venues ?? Array.from({length:raw.draws[0].length},(_,i)=>`Room ${i+1}`)).map((name) => ({
    id: uid(),
    name,
    active: true,
  }));
  p.rounds = raw.draws.map((rooms, r) => ({
    id: uid(),
    no: r + 1,
    createdAt: new Date().toISOString(),
    rooms: rooms.map((ids, i) => ({
      id: uid(),
      venueId: (raw.round_venues ? p.venues.find(v => v.name === raw.round_venues?.[r]?.[i]) : p.venues[i])?.id ?? (()=>{throw new Error("排程引用了不存在的场地")})(),
      teamIds: ids.map((t) => p.teams[t].id),
      judges: [],
      results: [],
    })),
  }));
  p.randomMeta = {
    seed: raw.seed ?? 20261022,
    mode: raw.mode === "adjusted" ? "adjusted" : "random-new",
    original: raw.original_draws ?? raw.draws,
    baseline: raw.swapped_baseline ?? null,
    changed: raw.changed_role_slots ?? 0,
    teamOrder: p.teams.map((t) => t.id), strongTeamIds: p.teams.filter(t => t.isStrong).map(t => t.id),options:raw.options,
  };
  return p;
}
async function importSQLite(file: File): Promise<Project> {
  const [{ default: initSqlJs }, { default: wasm }] = await Promise.all([
    import("sql.js"),
    import("sql.js/dist/sql-wasm.wasm?url"),
  ]);
  const SQL = await initSqlJs({ locateFile: () => wasm });
  const source = new SQL.Database(new Uint8Array(await file.arrayBuffer()));
  try {
    const query = (table: string) => {
      const result = source.exec(`SELECT * FROM ${table}`)[0];
      return result
        ? result.values.map((v) =>
            Object.fromEntries(result.columns.map((key, i) => [key, v[i]])),
          )
        : [];
    };
    const settings = Object.fromEntries(
      query("settings").map((r) => [String(r.key), r.value]),
    );
    const p = newProject(String(settings.tournament_name ?? "导入的赛事"));
    const teamId = (n: unknown) => `team-${n}`,
      judgeId = (n: unknown) => `judge-${n}`,
      venueId = (n: unknown) => `venue-${n}`;
    p.settings = {
      panelsPerRoom: Number(settings.panels_per_room ?? 0),
      assignTimer: settings.assign_timer === "1",
    };
    p.teams = query("teams").map((r) => ({
      id: teamId(r.id),
      name: String(r.team_name),
      speaker1: String(r.speaker1 ?? ""),
      speaker2: String(r.speaker2 ?? ""),
      institution: String(r.institution ?? ""),
      secondLanguage: !!r.second_language,
      active: !!r.active,
    }));
    const ic = query("adjudicator_institution_conflicts"),
      tc = query("adjudicator_team_conflicts");
    p.judges = query("adjudicators").map((r) => ({
      id: judgeId(r.id),
      name: String(r.name),
      institution: String(r.institution ?? ""),
      rating: Number(r.rating),
      active: !!r.active,
      workTask: String(r.work_task ?? ""),
      workTime: String(r.work_time ?? ""),
      conflictInstitutions: ic
        .filter((c) => c.adjudicator_id === r.id)
        .map((c) => String(c.institution)),
      conflictTeams: tc
        .filter((c) => c.adjudicator_id === r.id)
        .map((c) => teamId(c.team_id)),
    }));
    p.venues = query("venues").map((r) => ({
      id: venueId(r.id),
      name: String(r.name),
      active: !!r.active,
    }));
    const debates = query("debates"),
      teams = query("debate_teams"),
      judges = query("debate_adjudicators"),
      results = query("results");
    p.rounds = query("rounds")
      .sort((a, b) => Number(a.round_no) - Number(b.round_no))
      .map((r) => ({
        id: `round-${r.id}`,
        no: Number(r.round_no),
        createdAt: String(r.created_at ?? ""),
        rooms: debates
          .filter((d) => d.round_id === r.id)
          .sort((a, b) => Number(a.room_no) - Number(b.room_no))
          .map((d) => ({
            id: `room-${d.id}`,
            venueId: venueId(d.venue_id),
            teamIds: POSITIONS.map((pos) => {
              const team = teams.find(
                (t) => t.debate_id === d.id && t.position === pos,
              );
              if (!team) throw new Error("旧数据库存在缺失辩位");
              return teamId(team.team_id);
            }),
            judges: judges
              .filter((j) => j.debate_id === d.id)
              .map((j) => ({
                id: judgeId(j.adjudicator_id),
                role: j.role as "Chair" | "Panel" | "Timer",
              })),
            results: results
              .filter((rs) => rs.debate_id === d.id)
              .map((rs) => ({
                teamId: teamId(rs.team_id),
                rank: Number(rs.rank),
                score1: Number(rs.speaker1_score) || null,
                score2: Number(rs.speaker2_score) || null,
              })),
          })),
      }));
    return validateProject(p);
  } finally {
    source.close();
  }
}
export async function importFirstRound(file: File, p: Project) {
  if (p.rounds.length) throw new Error("只能在尚无轮次时导入首轮对阵");
  const rows = await readRecords(file);
  if (!rows.length) throw new Error("没有对阵数据");
  const next = structuredClone(p);
  const r = {
    id: uid(),
    no: 1,
    createdAt: new Date().toISOString(),
    rooms: rows.map((row) => {
      const name = value(row, ["venue", "场地", "房间"]);
      if (!name) throw new Error("缺少 Venue 场地列");
      let venue = next.venues.find((v) => v.name === name);
      if (!venue) {
        venue = { id: uid(), name, active: true };
        next.venues.push(venue);
      }
      const teamIds = POSITIONS.map((pos) => {
        const text = value(row, [pos]).split(/\r?\n/)[0].trim();
        const t = next.teams.find((t) => t.active && t.name === text);
        if (!t) throw new Error(`找不到启用队伍：${text}`);
        return t.id;
      });
      const text = value(row, ["adjudicators", "裁判"]);
      const assignments: { id: string; role: "Chair" | "Panel" | "Timer" }[] =
        [];
      for (const line of text.split(/\r?\n|;/)) {
        const match = line.match(
          /^\s*(Chair|Panel|Timer|主裁|副裁|计时员)\s*[:：]\s*(.+)$/i,
        );
        if (!match) continue;
        const role = /chair|主裁/i.test(match[1])
          ? "Chair"
          : /panel|副裁/i.test(match[1])
            ? "Panel"
            : "Timer";
        for (const name of match[2].split(/[,，、]/)) {
          const judge = next.judges.find(
            (j) => j.active && j.name === name.trim(),
          );
          if (!judge) throw new Error(`找不到裁判：${name}`);
          assignments.push({ id: judge.id, role });
        }
      }
      if (!assignments.length)
        throw new Error("裁判列格式应为 Chair: 姓名，可换行添加 Panel / Timer");
      return {
        id: uid(),
        venueId: venue.id,
        teamIds,
        judges: assignments,
        results: [],
      };
    }),
  };
  const validation = validateDraw(next, r);
  if (validation.errors.length) throw new Error(validation.errors.join("；"));
  if (
    new Set(r.rooms.flatMap((room) => room.teamIds)).size !==
    next.teams.filter((t) => t.active).length
  )
    throw new Error("首轮对阵未覆盖全部启用队伍");
  next.rounds = [r];
  return next;
}
export async function importRoundDraw(file: File, p: Project, no: number) {
  const old = p.rounds.find((r) => r.no === no);
  if (
    old?.rooms.some(
      (room) => room.results.length || room.drafts?.length || (room.ballots?.length ?? 0) > 0,
    )
  )
    throw new Error("本轮已有正式成绩或裁判评分，不能覆盖对阵");
  if (!old && no !== (p.rounds.at(-1)?.no ?? 0) + 1)
    throw new Error("只能导入已有轮次或下一轮");
  const imported = await importFirstRound(file, {
    ...p,
    rounds: [],
    randomMeta: undefined,
  });
  const round = { ...imported.rounds[0], no, bp:old?.bp };
  const next = {
    ...p,
    venues: imported.venues,
    rounds: [...p.rounds.filter((r) => r.no !== no), round].sort(
      (a, b) => a.no - b.no,
    ),
  };
  for (const r of next.rounds) {
    const errors = validateDraw(next, r).errors;
    if (errors.length) throw new Error(errors.join("；"));
  }
  if (next.randomMeta) delete next.randomMeta.resources;
  if (p.randomMeta) {
    const m = p.randomMeta;
    const report = validateSchedule(
      next.rounds.map((r) =>
        r.rooms.map((room) =>
          room.teamIds.map((id) => m.teamOrder.indexOf(id)),
        ),
      ),
      m.teamOrder.map((id) => p.teams.find((t) => t.id === id)!.name),
      m.teamOrder.map(id => !!m.strongTeamIds?.includes(id)), m.options?.maxMeetings ?? 2,
    );
    if (report.max_pair_meetings > (m.options?.maxMeetings??2))
      throw new Error("交手次数超过设定上限");
  }
  return next;
}
