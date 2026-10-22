import { describe, it, expect } from "vitest";
import { demoProject } from "../db";
import {
  generatePowerRound,
  validateDraw,
  minimumAssignment,
  judgeAvailable,
} from "../pairing";
import { teamStandings, validateResults } from "../standings";
import { parseQuickRanks, applyScoreRows } from "../score-import";
import { parseTeams, validateProject } from "../import";
describe("赛事核心规则", () => {
  it("4132 按 OG OO CG CO 解析，拒绝重复或缺失名次", () => {
    expect(parseQuickRanks("4132")).toEqual([4, 1, 3, 2]);
    for (const s of ["1111", "123", "1235", "abcd"])
      expect(() => parseQuickRanks(s)).toThrow();
  });
  it("BP 成绩配对完整跑五轮，积分池及导入校验有效", () => {
    const p = demoProject();
    p.settings.preliminaryRounds = 5;
    for (let n = 1; n <= 5; n++) {
      const r = generatePowerRound(p, n);
      expect(r.bp?.version).toBe(1);
      expect(validateDraw(p, r).errors).toEqual([]);
      for (const room of r.rooms)
        room.results = room.teamIds.map((teamId, i) => ({
          teamId,
          rank: i + 1,
          score1: 75 + i,
          score2: null,
        }));
      p.rounds.push(r);
    }
    for (const t of p.teams) {
      const roles = p.rounds
        .slice(0, 4)
        .map((r) =>
          r.rooms
            .find((room) => room.teamIds.includes(t.id))!
            .teamIds.indexOf(t.id),
        );
      expect(roles).toHaveLength(4);
    }
    expect(teamStandings(p).reduce((s, t) => s + t.points, 0)).toBe(90);
    expect(validateProject(p)).toBe(p);
  });
  it("前序成绩不完整时拒绝生成下一轮", () => {
    const p = demoProject();
    p.rounds.push(generatePowerRound(p));
    expect(() => generatePowerRound(p)).toThrow("前序");
  });
  it("主副裁全局分配不重复，回避优先于等级", () => {
    expect(
      minimumAssignment([
        [0, 100],
        [0, 1000],
      ]),
    ).toEqual([1, 0]);
    const p = demoProject();
    p.settings = { panelsPerRoom: 1, assignTimer: true };
    const r = generatePowerRound(p);
    expect(
      new Set(r.rooms.flatMap((room) => room.judges.map((j) => j.id))).size,
    ).toBe(9);
    expect(r.rooms.every((room) => room.judges.length === 3)).toBe(true);
  });
  it("任务限制与替补保持原系统行为", () => {
    const p = demoProject(),
      j = p.judges[0];
    expect(judgeAvailable({ ...j, workTask: "Round 1-2、4-5 +Final" }, 3)).toBe(
      false,
    );
    expect(judgeAvailable({ ...j, workTask: "Round 1-2、4-5 +Final" }, 4)).toBe(
      true,
    );
    expect(judgeAvailable({ ...j, workTask: "替补" }, 1)).toBe(false);
    expect(judgeAvailable({ ...j, workTask: "", workTime: "5月23日" }, 1)).toBe(
      true,
    );
  });
  it("CUDC 表头和学校向下填充，只保留赛事字段", () => {
    const teams = parseTeams([
      {
        "队伍名称（必填）": "A",
        "队员 1 姓名（必填）": "X",
        "队员 2 姓名（必填）": "Y",
        学校: "甲大学",
        电话: "secret",
      },
      { "队伍名称（必填）": "B" },
    ]);
    expect(teams[0].speaker1).toBe("X");
    expect(teams[1].institution).toBe("甲大学");
    expect(JSON.stringify(teams)).not.toContain("secret");
  });
  it("重复名次或越界分数无法保存", () => {
    const ids = ["a", "b", "c", "d"];
    expect(() =>
      validateResults(
        ids,
        ids.map((teamId) => ({ teamId, rank: 1, score1: null, score2: null })),
      ),
    ).toThrow();
    expect(() =>
      validateResults(
        ids,
        ids.map((teamId, i) => ({
          teamId,
          rank: i + 1,
          score1: i === 0 ? 101 : null,
          score2: null,
        })),
      ),
    ).toThrow();
  });
  it("导入按场校验并原子更新，保留独立裁判评分", () => {
    const p = demoProject();
    p.rounds.push(generatePowerRound(p));
    const room = p.rounds[0].rooms[0],
      judge = p.judges.find((j) => j.id === room.judges[0].id)!;
    const rows = room.teamIds.map((id, i) => ({
      轮次: 1,
      场地: p.venues.find((v) => v.id === room.venueId)!.name,
      队名: p.teams.find((t) => t.id === id)!.name,
      裁判: judge.name,
      名次: i + 1,
      辩手1分数: 75,
    }));
    const imported = applyScoreRows(rows, p);
    expect(imported.rounds[0].rooms[0].ballots?.length).toBe(1);
    expect(imported.rounds[0].rooms[0].results).toEqual([]);
    expect(p.rounds[0].rooms[0].ballots).toBeUndefined();
    expect(() => applyScoreRows(rows.slice(1), p)).toThrow();
  });
});
