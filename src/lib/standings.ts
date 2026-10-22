import { type Project, type Result } from "./types";
export function teamStandings(p: Project) {
  return p.teams
    .map((team) => {
      const results = p.rounds.flatMap((r) =>
        r.rooms.flatMap((room) =>
          room.results.filter((x) => x.teamId === team.id),
        ),
      );
      const scores = results
        .flatMap((r) => [r.score1, r.score2])
        .filter((n): n is number => n !== null);
      const total = scores.reduce((s, n) => s + n, 0);
      return {
        ...team,
        rounds: results.length,
        points: results.reduce((s, r) => s + 4 - r.rank, 0),
        total,
        average: scores.length ? total / scores.length : 0,
      };
    })
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.total - a.total ||
        a.name.localeCompare(b.name, "zh-CN"),
    );
}
export function speakerStandings(p: Project) {
  return p.teams
    .flatMap((t) =>
      [1, 2].map((index) => {
        const name = index === 1 ? t.speaker1 : t.speaker2;
        const scores = p.rounds
          .flatMap((r) =>
            r.rooms.flatMap((room) =>
              room.results
                .filter((x) => x.teamId === t.id)
                .map((x) => (index === 1 ? x.score1 : x.score2)),
            ),
          )
          .filter((n): n is number => n !== null && n > 0);
        return {
          id: `${t.id}-${index}`,
          name,
          team: t.name,
          institution: t.institution,
          rounds: scores.length,
          total: scores.reduce((s, n) => s + n, 0),
          average: scores.length
            ? scores.reduce((s, n) => s + n, 0) / scores.length
            : 0,
        };
      }),
    )
    .filter((s) => s.name)
    .sort(
      (a, b) =>
        b.total - a.total ||
        b.average - a.average ||
        a.name.localeCompare(b.name, "zh-CN"),
    );
}
export function validateResults(teamIds: string[], results: Result[]) {
  if (
    results.length !== 4 ||
    new Set(results.map((r) => r.teamId)).size !== 4 ||
    results.some((r) => !teamIds.includes(r.teamId)) ||
    results
      .map((r) => r.rank)
      .sort()
      .join() !== "1,2,3,4"
  )
    throw new Error("每个赛场的四支队伍排名必须恰好为 1、2、3、4，不可重复");
  for (const r of results)
    for (const score of [r.score1, r.score2])
      if (
        score !== null &&
        (!Number.isFinite(score) || score < 60 || score > 100)
      )
        throw new Error("辩手分数须为 60–100 的数字，也可留空");
}
