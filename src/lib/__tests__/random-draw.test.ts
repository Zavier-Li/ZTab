import { describe, it, expect } from "vitest";
import fixture from "./python-fixture.json";
import {
  PythonRandom,
  generateRandomDraw,
  assignRoles,
  validateSchedule,
} from "../random-draw";
describe("Python 随机排程迁移", () => {
  it("MT19937 与原 Python random.Random 完全一致", () => {
    const rng = new PythonRandom(20261022);
    expect(Array.from({ length: 5 }, () => rng.random())).toEqual(
      fixture.random,
    );
  });
  it("相同种子结果可复现，对手覆盖如实报告", () => {
    const generated = generateRandomDraw(20261022, fixture.names, "random-new");
    expect(generated.report.distinct_pairs).toBe(54);
    expect(generated.report.max_pair_meetings).toBeLessThanOrEqual(2);
    expect(generated.report.teams.every(t => t.distinct_opponents === 9)).toBe(true);
    expect(generated.report.coverage_optimal).toBe(true);
    expect(generated.draws).toEqual(generateRandomDraw(20261022, fixture.names, "random-new").draws);
    expect(generated.draws).not.toEqual(generateRandomDraw(20261023, fixture.names, "random-new").draws);
  });
  it.each([1, 42, 20261023])(
    "独立随机种子 %s 满足四轮出场与辩位",
    (seed) => {
      const g = generateRandomDraw(seed, fixture.names, "random-new");
      expect(g.report.teams.every((t) => new Set(t.roles).size === 4)).toBe(
        true,
      );
    },
    20000,
  );
  it("任意四正则队伍-赛场图能分解为四个完美匹配", () => {
    const groups = Array.from({ length: 4 }, () => [
      Array.from({ length: 4 }, (_, i) => i),
      [4, 5, 6, 7],
      [8, 9, 10, 11],
    ]);
    expect(
      validateSchedule(assignRoles(groups), fixture.names).teams.every(
        (t) => new Set(t.roles).size === 4,
      ),
    ).toBe(true);
  });
  it("拒绝重复出场、缺少轮次、重复辩位", () => {
    const draw = structuredClone(fixture.original);
    draw[0][0][0] = draw[0][0][1];
    expect(() => validateSchedule(draw, fixture.names)).toThrow();
    expect(() =>
      validateSchedule(fixture.original.slice(1), fixture.names),
    ).toThrow();
    const roles = structuredClone(fixture.original);
    [roles[0][0][0], roles[0][0][1]] = [roles[0][0][1], roles[0][0][0]];
    expect(() => validateSchedule(roles, fixture.names)).toThrow();
  });
});
