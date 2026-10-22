import { type Project, type Result } from "./types";
import { readRecords, value } from "./import";
import { validateResults } from "./standings";
export async function importScores(file: File, p: Project) {
  return applyScoreRows(await readRecords(file), p);
}
export function applyScoreRows(rows: Record<string, unknown>[], p: Project) {
  if (!rows.length) throw new Error("文件没有评分数据");
  const next = structuredClone(p),
    groups = new Map<
      string,
      { roundId: string; roomId: string; judgeId: string; results: Result[] }
    >();
  for (const row of rows) {
    const no = Number(value(row, ["round", "轮次", "场次"])),
      venue = value(row, ["venue", "场地", "房间"]),
      name = value(row, ["team", "team name", "队伍", "队名", "队伍名称"]),
      judgeName = value(row, ["judge", "adjudicator", "裁判", "裁判姓名"]);
    const round = next.rounds.find((r) => r.no === no),
      v = next.venues.find((v) => v.name === venue),
      team = next.teams.find((t) => t.name === name);
    if (!round || !v || !team)
      throw new Error(`找不到轮次、场地或队伍：${no} / ${venue} / ${name}`);
    if (!next.randomMeta && next.rounds.some((r) => r.no > no))
      throw new Error(`第 ${no} 轮已有后续成绩配对，不能修改评分`);
    const room = round.rooms.find(
      (room) => room.venueId === v.id && room.teamIds.includes(team.id),
    );
    if (!room) throw new Error(`${name} 不在第 ${no} 轮 ${venue} 对阵中`);
    const judge = judgeName
      ? next.judges.find((j) => j.name === judgeName)
      : null;
    if (
      judgeName &&
      (!judge ||
        !room.judges.some((j) => j.id === judge.id && j.role !== "Timer"))
    )
      throw new Error(`${judgeName} 不是该场的评分裁判`);
    const rank = Number(value(row, ["rank", "排名", "名次"]));
    const score = (keys: string[]) => {
      const text = value(row, keys);
      return text ? Number(text) : null;
    };
    const result = {
      teamId: team.id,
      rank,
      score1: score([
        "speaker1 score",
        "speaker1_score",
        "辩手1分数",
        "队员1分数",
      ]),
      score2: score([
        "speaker2 score",
        "speaker2_score",
        "辩手2分数",
        "队员2分数",
      ]),
    };
    const key = `${room.id}:${judge?.id ?? "official"}`;
    if (!groups.has(key))
      groups.set(key, {
        roundId: round.id,
        roomId: room.id,
        judgeId: judge?.id ?? "",
        results: [],
      });
    groups.get(key)!.results.push(result);
  }
  for (const g of groups.values()) {
    const room = next.rounds
      .find((r) => r.id === g.roundId)!
      .rooms.find((r) => r.id === g.roomId)!;
    validateResults(room.teamIds, g.results);
    room.drafts = room.drafts?.filter(d => d.judgeId !== (g.judgeId || "official"));
    if (g.judgeId)
      room.ballots = [
        ...(room.ballots ?? []).filter((b) => b.judgeId !== g.judgeId),
        {
          judgeId: g.judgeId,
          results: g.results,
          updatedAt: new Date().toISOString(),
        },
      ];
    else room.results = g.results;
  }
  return next;
}
export function parseQuickRanks(text: string) {
  const value = text.replace(/\s/g, "");
  if (!/^[1-4]{4}$/.test(value) || new Set(value).size !== 4)
    throw new Error("快捷名次必须是 1、2、3、4 各一次，例如 4132");
  return [...value].map(Number);
}
