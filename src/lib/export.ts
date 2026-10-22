import { POSITIONS, type Project, type Round } from "./types";
import { download, esc } from "./utils";
import { teamStandings, speakerStandings } from "./standings";
import { validateSchedule } from "./random-draw";
export function exportJSON(p: Project) {
  download(
    JSON.stringify(
      {
        format: "ztab",
        version: 1,
        exportedAt: new Date().toISOString(),
        project: p,
      },
      null,
      2,
    ),
    `${p.name}-备份.json`,
    "application/json",
  );
}
const csvCell = (s: unknown) => {
  let text = String(s ?? "");
  if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
  return `"${text.replace(/"/g, '""')}"`;
};
export function exportCSV(rows: unknown[][], name: string) {
  download(
    "\ufeff" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n"),
    name,
    "text/csv;charset=utf-8",
  );
}
export function drawRows(p: Project, r: Round) {
  return [
    ["Venue", ...POSITIONS, "Adjudicators"],
    ...r.rooms.map((room) => [
      p.venues.find((v) => v.id === room.venueId)?.name,
      ...room.teamIds.map((id) => {
        const t = p.teams.find((t) => t.id === id)!;
        return `${t.name}\n${t.speaker1} / ${t.speaker2}`;
      }),
      room.judges
        .map((j) => `${j.role}: ${p.judges.find((a) => a.id === j.id)?.name}`)
        .join("\n"),
    ]),
  ];
}
export function exportStandings(p: Project, speakers = false) {
  exportCSV(
    speakers
      ? [
          ["排名", "辩手", "队伍", "学校", "轮次", "总分", "均分"],
          ...speakerStandings(p).map((t, i) => [
            i + 1,
            t.name,
            t.team,
            t.institution,
            t.rounds,
            t.total,
            t.average.toFixed(2),
          ]),
        ]
      : [
          [
            "排名",
            "队伍",
            "学校",
            "状态",
            "已完成轮次",
            "积分",
            "辩手总分",
            "辩手均分",
          ],
          ...teamStandings(p).map((t, i) => [
            i + 1,
            t.name,
            t.institution,
            t.active ? "启用" : "停用",
            t.rounds,
            t.points,
            t.total,
            t.average.toFixed(2),
          ]),
        ],
    `${p.name}-${speakers ? "辩手" : "队伍"}排名.csv`,
  );
}
function htmlDocument(p: Project, r: Round, ballot = false) {
  const rows = drawRows(p, r);
  const content = ballot
    ? r.rooms
        .map(
          (room) =>
            `<section><h2>${esc(p.venues.find((v) => v.id === room.venueId)?.name)}</h2><p>${esc(room.judges.map((j) => `${j.role}: ${p.judges.find((a) => a.id === j.id)?.name}`).join(" / "))}</p><table><tr><th>Position</th><th>Team / Speakers</th><th>Speaker 1</th><th>Speaker 2</th><th>Rank</th></tr>${room.teamIds
              .map((id, i) => {
                const t = p.teams.find((t) => t.id === id)!;
                return `<tr><td>${POSITIONS[i]}</td><td>${esc(t.name)}<br>${esc(t.speaker1)} / ${esc(t.speaker2)}</td><td></td><td></td><td></td></tr>`;
              })
              .join(
                "",
              )}</table><p>主裁签名：________________　日期：________________</p></section>`,
        )
        .join("")
    : `<table>${rows.map((row, i) => `<tr>${row.map((cell) => `<${i ? "td" : "th"}>${esc(cell).replace(/\n/g, "<br>")}</${i ? "td" : "th"}>`).join("")}</tr>`).join("")}</table>`;
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>${esc(p.name)} · Round ${r.no}</title><style>body{font:14px/1.6 "Times New Roman","华文中宋","STZhongsong",serif;color:#20252b;margin:40px}h1{font-size:26px}table{border-collapse:collapse;width:100%;margin:24px 0}th,td{padding:18px 12px;border:1px solid #ddd;text-align:left}th{background:#f3f4f6}section{break-after:page}button{padding:10px 24px;cursor:pointer}@media print{button{display:none}body{margin:0}@page{size:A4 landscape;margin:15mm}}</style><h1>${esc(p.name)}</h1><p>ROUND ${r.no} · ${ballot ? "Ballots 裁判评分单" : "Draw Overview 对阵总览"}</p><button onclick="window.print()">打印 / 保存为 PDF</button>${content}</html>`;
}
export function exportHTML(p: Project, r: Round, ballot = false) {
  download(
    htmlDocument(p, r, ballot),
    `Round-${r.no}-${ballot ? "ballots" : "overview"}.html`,
    "text/html;charset=utf-8",
  );
}
export async function exportPPT(p: Project, r: Round) {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const ppt = new PptxGenJS();
  ppt.layout = "LAYOUT_WIDE";
  ppt.author = "ZTab";
  ppt.subject = p.name;
  ppt.title = `${p.name} · Round ${r.no}`;
  let slide = ppt.addSlide();
  slide.background = { color: "F6F7F9" };
  slide.addText("ZTab / DEBATE TOURNAMENT", {
    x: 0.6,
    y: 0.5,
    w: 11,
    h: 0.4,
    fontSize: 13,
    color: "ED693D",
  });
  slide.addText(p.name, {
    x: 0.6,
    y: 2,
    w: 12,
    h: 1,
    fontSize: 32,
    bold: true,
    color: "20252B",
  });
  slide.addText(`ROUND ${r.no} · 对阵总览`, {
    x: 0.6,
    y: 3.4,
    w: 10,
    h: 0.8,
    fontSize: 23,
    color: "6B7280",
  });
  for (const room of r.rooms) {
    slide = ppt.addSlide();
    slide.addText(
      `${p.venues.find((v) => v.id === room.venueId)?.name} · Round ${r.no}`,
      {
        x: 0.5,
        y: 0.4,
        w: 12,
        h: 0.7,
        fontSize: 26,
        bold: true,
        color: "20252B",
      },
    );
    slide.addTable(
      [
        ["辩位", "队伍", "辩手"],
        ...room.teamIds.map((id, i) => {
          const t = p.teams.find((t) => t.id === id)!;
          return [POSITIONS[i], t.name, `${t.speaker1} / ${t.speaker2}`];
        }),
      ].map((row) => row.map((text) => ({ text }))),
      {
        x: 0.5,
        y: 1.5,
        w: 12.3,
        h: 3.5,
        border: { type: "solid", color: "E5E7EB", pt: 1 },
        fontSize: 17,
        color: "20252B",
        margin: 12,
      },
    );
    slide.addText(
      room.judges
        .map((j) => `${j.role}: ${p.judges.find((a) => a.id === j.id)?.name}`)
        .join("   "),
      { x: 0.5, y: 5.5, w: 12, h: 1, fontSize: 16, color: "6B7280" },
    );
  }
  download(await ppt.write({ outputType: "arraybuffer" }) as ArrayBuffer, `Round-${r.no}-对阵.pptx`, "application/vnd.openxmlformats-officedocument.presentationml.presentation");
}
function pngBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("PNG 导出失败"))),
      "image/png",
    ),
  );
}
function canvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  size = 24,
  bold = false,
) {
  ctx.font = `${bold ? 600 : 400} ${size}px "Times New Roman","华文中宋","STZhongsong",serif`;
  while (ctx.measureText(text).width > width && size > 12) {
    size--;
    ctx.font = `${bold ? 600 : 400} ${size}px "Times New Roman","华文中宋","STZhongsong",serif`;
  }
  ctx.fillText(text, x, y);
}
export async function exportScheduleZIP(p: Project) {
  if (!p.randomMeta) throw new Error("只有四轮随机模式可以导出完整随机排程包");
  const meta = p.randomMeta;
  const draws = p.rounds.map((r) =>
    r.rooms.map((room) => room.teamIds.map((id) => meta.teamOrder.indexOf(id))),
  );
  const teams = meta.teamOrder.map((id) => {
    const t = p.teams.find((t) => t.id === id)!;
    return { name: t.name, speaker1: t.speaker1, speaker2: t.speaker2, isStrong: !!meta.strongTeamIds?.includes(t.id) };
  });
  const report = validateSchedule(
    draws,
    teams.map((t) => t.name), teams.map(t => t.isStrong), meta.options?.maxMeetings ?? 2,
  );
  if (report.max_pair_meetings > (meta.options?.maxMeetings??2))
    throw new Error("交手次数超过设定上限");
  const [{ default: JSZip }, XLSX] = await Promise.all([
    import("jszip"),
    import("xlsx"),
  ]);
  const zip = new JSZip(),
    workbook = XLSX.utils.book_new();
  for (const r of p.rounds) {
    const rows = drawRows(p, r);
    const sheet = XLSX.utils.aoa_to_sheet([
      [`${p.name} · 第${r.no}场 ${r.timeSlot??""}`],
      ...rows,
    ]);
    sheet["!cols"] = [
      { wch: 16 },
      ...Array.from({ length: 5 }, () => ({ wch: 30 })),
    ];
    XLSX.utils.book_append_sheet(workbook, sheet, `第${r.no}场`);
    const canvas = document.createElement("canvas");
    canvas.width = 2100;
    canvas.height = 200 + rows.length * 160;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#20252b";
    canvasText(ctx, p.name, 40, 65, 2000, 36, true);
    ctx.fillStyle = "#777";
    canvasText(
      ctx,
      `ROUND ${r.no}  ${r.timeSlot??""}  ${p.eventPlan?.tabOperator?"Tab: "+p.eventPlan.tabOperator:""}`,
      40,
      115,
      2000,
      21,
    );
    const widths = [170, 350, 350, 350, 350, 450];
    rows.forEach((row, i) => {
      let x = 40;
      const y = 160 + i * 160;
      row.forEach((cell, c) => {
        ctx.fillStyle = i === 0 ? "#f3f4f6" : "#fff";
        ctx.fillRect(x, y, widths[c], 160);
        ctx.strokeStyle = "#ddd";
        ctx.strokeRect(x, y, widths[c], 160);
        ctx.fillStyle = i === 0 ? "#73777e" : "#20252b";
        String(cell ?? "")
          .split("\n")
          .slice(0, 4)
          .forEach((line, l) =>
            canvasText(
              ctx,
              line,
              x + 14,
              y + 45 + l * 32,
              widths[c] - 28,
              i === 0 ? 22 : l ? 20 : 25,
              i > 0 && l === 0,
            ),
          );
        x += widths[c];
      });
    });
    ctx.fillStyle = "#777";
    const coverage = report.teams.map((t) => t.distinct_opponents);
    canvasText(
      ctx,
      `每队四个辩位各一次 · 不同对手 ${Math.min(...coverage)}–${Math.max(...coverage)} 支 · 任意两队最多交手 ${report.max_pair_meetings} 次`,
      40,
      865,
      2000,
      22,
    );
    zip.file(`第${r.no}场对阵图.png`, await pngBlob(canvas));
  }
  const checkSheet = XLSX.utils.aoa_to_sheet([
    ["队名", "第一场", "第二场", "第三场", "第四场", "不同对手数"],
    ...report.teams.map((t) => [t.name, ...t.roles, t.distinct_opponents]),
  ]);
  XLSX.utils.book_append_sheet(workbook, checkSheet, "辩位与对手校验");
  zip.file(
    "四场对阵表.xlsx",
    XLSX.write(workbook, { bookType: "xlsx", type: "array" }),
  );
  zip.file(
    "排程与校验.json",
    JSON.stringify(
      {
        seed: meta.seed,
        teams,
        draws,
        validation: report,
        original_draws: meta.original,
        swapped_baseline: meta.baseline,
        changed_role_slots: meta.changed,
        mode: meta.mode,options:meta.options,resource_optimization:meta.resources,
        round_venues: p.rounds.map(r => r.rooms.map(room => p.venues.find(v => v.id === room.venueId)!.name)),
        venues: p.venues
          .filter((v) => p.rounds.some(round => round.rooms.some(room => room.venueId === v.id)))
          .map((v) => v.name),
      },
      null,
      2,
    ),
  );
  download(
    await zip.generateAsync({ type: "arraybuffer" }),
    `${p.name}-四轮排程-${meta.seed}.zip`,
  );
}
