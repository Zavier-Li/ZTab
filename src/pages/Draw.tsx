import { optimizeDrawResources } from '@/lib/draw-resources';
import { analyzeBPRound } from '@/lib/bp-pairing';
import {TableFrame} from '@/components/shared';
import { ReportExport } from '@/components/ReportExport';
import { db } from '@/lib/db';
import { EventPlanSummary } from "@/components/EventPlan";
import PanelEditor from "@/components/PanelEditor";
import { t as tr } from "@/lib/i18n";
import { useEffect, useRef, useState } from "react";
import { Plus, Download, Shuffle, ShieldCheck, Sparkles, ArrowRight, GitBranch, CheckCircle2, TriangleAlert, Pencil, Scale, Upload, } from "lucide-react";
import { PageTitle, Panel, Badge, Empty, type PageProps, } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { POSITIONS, uid, completeRound, type Project, type Round, } from "@/lib/types";
import { generatePowerRound, assignJudges, judgeAvailable, validateDraw, } from "@/lib/pairing";
import { validateSchedule, type generateRandomDraw } from "@/lib/random-draw";
import { exportCSV, drawRows, exportHTML, exportPPT, exportScheduleZIP, } from "@/lib/export";
import { importRoundDraw } from "@/lib/import";
import { errorText } from "@/lib/utils";
import { hasAnyScores } from '@/lib/types';
import { defaultDrawOptions, validateDrawOptions, type DrawOptions } from '@/lib/random-draw';
type Generated = ReturnType<typeof generateRandomDraw> & {groupCandidates?:number};
type Edit = {
    room: number;
    kind: "team" | "judge" | "venue";
    index: number;
    value: string;
};
export default function Draw({ p, update, notify, go }: PageProps) {
    const [options, setOptions] = useState<DrawOptions>(p.randomMeta?.options ? { ...p.randomMeta.options, schoolThreshold: 3 } : {...defaultDrawOptions, maxMeetings: Math.min(4, Math.max(2, Math.ceil(12 / Math.max(1, p.teams.filter(t => t.active).length - 1))))});
    const scoresExist = hasAnyScores(p);
    const [strongOpen, setStrongOpen] = useState(false);
    const activeTeams = p.teams.filter(t => t.active);
    const strongTeams = activeTeams.filter(t => t.isStrong);
    const [tagBusy, setTagBusy] = useState(false);
    async function toggleStrong(id: string) {
        setTagBusy(true);
        try { await db.transaction("rw", db.projects, async () => { const latest = await db.projects.get(p.id); if (!latest || hasAnyScores(latest)) throw new Error(tr("已有成绩，不能修改强队标签")); const team = latest.teams.find(t => t.id === id); if (!team) return; team.isStrong = !team.isStrong; latest.updatedAt = new Date().toISOString(); await db.projects.put(latest); }); } catch(e) { notify(errorText(e), true); } finally { setTagBusy(false); }
    }
    const mode = "random-new" as const;
    const [panelRoom, setPanelRoom] = useState<number | null>(null);
    const [selected, setSelected] = useState(p.rounds.at(-1)?.no ?? 1), [randomOpen, setRandomOpen] = useState(false), [seed, setSeed] = useState(String(crypto.getRandomValues(new Uint32Array(1))[0])), [busy, setBusy] = useState(false), [progress, setProgress] = useState(0), [edit, setEdit] = useState<Edit | null>(null), [checking, setChecking] = useState(false), [exporting, setExporting] = useState(false);
    const workerRef = useRef<Worker | null>(null), file = useRef<HTMLInputElement>(null);
    useEffect(() => () => workerRef.current?.terminate(), []);
    useEffect(() => {
        if (!p.rounds.some((r) => r.no === selected))
            setSelected(p.rounds.at(-1)?.no ?? 1);
    }, [p.id, p.rounds, selected]);
    const round = p.rounds.find((r) => r.no === selected) ?? p.rounds.at(-1);
    const validation = round ? validateDraw(p, round) : null;
    let report = null;
    let reportError = "";
    try {
        if (p.randomMeta)
            report = validateSchedule(p.rounds.map((r) => r.rooms.map((room) => room.teamIds.map((id) => p.randomMeta!.teamOrder.indexOf(id)))), p.randomMeta.teamOrder.map((id) => p.teams.find((t) => t.id === id)!.name), p.randomMeta.teamOrder.map(id => !!p.randomMeta?.strongTeamIds?.includes(id)), p.randomMeta.options?.maxMeetings ?? 2);
    }
    catch (e) {
        reportError = errorText(e);
    }
    const teamAudit = new Map(p.teams.map(team => {
        const opponents = new Map<string, number>(), venues = new Map<string, number>(), judges = new Map<string, number>();
        for (const r of p.rounds) for (const room of r.rooms) {
            if (!room.teamIds.includes(team.id)) continue;
            venues.set(room.venueId, (venues.get(room.venueId) ?? 0) + 1);
            for (const id of room.teamIds.filter(id => id !== team.id)) opponents.set(id, (opponents.get(id) ?? 0) + 1);
            for (const judge of room.judges.filter(j => j.role !== 'Timer')) judges.set(judge.id, (judges.get(judge.id) ?? 0) + 1);
        }
        return [team.name, {opponents: Math.max(0, ...opponents.values()), venues: Math.max(0, ...venues.values()), judges: Math.max(0, ...judges.values())}];
    }));
    async function power() {
        try {
            setBusy(true);
            const r = await db.transaction('rw', db.projects, async () => {
                const latest = await db.projects.get(p.id);
                if (!latest || latest.updatedAt !== p.updatedAt) throw new Error(tr('赛事数据已变更，请重新生成'));
                const generated = generatePowerRound(latest);
                const errors = validateDraw(latest, generated).errors;
                if (errors.length) throw new Error(errors.join('；'));
                latest.rounds.push(generated);
                latest.updatedAt = new Date().toISOString();
                await db.projects.put(latest);
                return generated;
            });
            setSelected(r.no);
            notify(tr("第 {0} 轮已生成", [r.no]));
        }
        catch (e) {
            notify(errorText(e), true);
        } finally { setBusy(false); }
    }
    function random() {
        if (scoresExist) {
            notify(tr("已有成绩或裁判评分，不能重新排阵"), true);
            return;
        }
        const teams = p.teams.filter((t) => t.active);
        if (teams.length < 4 || teams.length % 4) {
            notify(tr("BP 预排队伍数须为 4 的倍数，当前 {0} 支", [teams.length]), true);
            return;
        }
        const n = Number(seed);
        if (!Number.isSafeInteger(n) || n < 0 || n > 4294967295) {
            notify(tr("请输入 0–4294967295 范围内的整数种子"), true);
            return;
        }
        try {
            validateDrawOptions(options, teams.map(t => t.institution), teams.length);
            if (p.venues.filter(v => v.active).length < teams.length / 4) throw new Error(tr("需要 {0} 个启用场地，当前只有 {1} 个", [teams.length / 4, p.venues.filter(v => v.active).length]));
        }
        catch (e) {
            notify(errorText(e), true);
            return;
        }
        setBusy(true);
        setProgress(0);
        const worker = new Worker(new URL("../lib/draw.worker.ts", import.meta.url), {
            type: "module",
        });
        workerRef.current = worker;
        worker.onerror = (e) => {
            setBusy(false);
            worker.terminate();
            notify(tr("生成失败：{0}", [e.message]), true);
        };
        worker.onmessage = async (e) => {
            if (e.data.type === "progress") {
                setProgress(e.data.progress);
                return;
            }
            worker.terminate();
            workerRef.current = null;
            if (e.data.type === "error") {
                setBusy(false);
                notify(e.data.message, true);
                return;
            }
            try {
                const generated = e.data.data as Generated;
                const latest = await db.projects.get(p.id);
                if (!latest || hasAnyScores(latest) || latest.updatedAt !== p.updatedAt)
                    throw new Error(tr('赛事数据已变更，请重新生成'));
                const next = structuredClone(p);
                const neededRooms = teams.length / 4;
                const usePlan = !!next.eventPlan && next.eventPlan.venueIds.length >= neededRooms && next.eventPlan.venueIds.every(id => next.venues.some(v => v.id === id && v.active));
                const venues = usePlan ? next.eventPlan!.venueIds.map(id => next.venues.find(v => v.id === id)!) : next.venues.filter(v => v.active);
                if (venues.length < neededRooms) throw new Error(tr('启用场地数量不足'));
                const rounds: Round[] = generated.draws.map((rooms, i) => ({
                    id: uid(),
                    no: i + 1,
                    timeSlot: next.eventPlan?.timeSlots[i],
                    createdAt: new Date().toISOString(),
                    rooms: rooms.map((ids, j) => ({
                        id: uid(),
                        venueId: venues[j].id,
                        teamIds: ids.map((id) => teams[id].id),
                        judges: [],
                        results: [],
                    })),
                }));
                for (const r of rounds) {
                    if (usePlan) {
                        const panels = next.eventPlan!.judgePanels[r.no - 1];
                        r.rooms.forEach((room, i) => {
                            room.judges = (panels?.[i] ?? []).map((id, j) => {
                                if (!next.judges.some((a) => a.id === id && a.active))
                                    throw new Error(tr("预设裁判不存在或已停用"));
                                return {
                                    id,
                                    role: j === 0 ? ("Chair" as const) : ("Panel" as const),
                                };
                            });
                        });
                        const errors = validateDraw({ ...next, rounds }, r).errors;
                        if (errors.length)
                            throw new Error(errors.join("；"));
                    }
                    else if (next.judges.filter((j) => judgeAvailable(j, r.no)).length >=
                        neededRooms *
                            (1 +
                                next.settings.panelsPerRoom +
                                Number(next.settings.assignTimer)))
                        assignJudges({ ...next, rounds: rounds.filter(previous => previous.no < r.no) }, r);
                }
                const resources = mode === 'random-new' ? optimizeDrawResources({...next, eventPlan: usePlan ? next.eventPlan : undefined}, rounds, n) : undefined;
                next.rounds = rounds;
                next.randomMeta = {
                    seed: n,
                    mode,
                    original: generated.original,
                    baseline: generated.baseline,
                    changed: generated.changed,
                    teamOrder: teams.map((t) => t.id), strongTeamIds: teams.filter(t => t.isStrong).map(t => t.id), options, resources:resources ? {...resources,groupCandidates:generated.groupCandidates ?? 1} : undefined,
                };
                await update(next);
                setSelected(1);
                setRandomOpen(false);
                notify(tr("四轮排程已生成，辩位与交手次数校验通过"));
            }
            catch (e) {
                notify(errorText(e), true);
            }
            finally {
                setBusy(false);
            }
        };
        worker.postMessage({
            seed: n,
            names: teams.map((t) => t.name), options, institutions: teams.map(t => t.institution),
            mode, project:p,
        });
    }
    async function applyEdit() {
        if (!edit || !round)
            return;
        try {
            const next = structuredClone(p), r = next.rounds.find((r) => r.id === round.id)!;
            if (r.rooms.some((room) => room.results.length || room.drafts?.length || (room.ballots?.length ?? 0)))
                throw new Error(tr("本轮已有成绩，不允许更改对阵"));
            if (edit.kind === "team") {
                const old = r.rooms[edit.room].teamIds[edit.index];
                for (const room of r.rooms) {
                    const i = room.teamIds.indexOf(edit.value);
                    if (i >= 0)
                        room.teamIds[i] = old;
                }
                r.rooms[edit.room].teamIds[edit.index] = edit.value;
            }
            else if (edit.kind === "venue") {
                const old = r.rooms[edit.room].venueId;
                for (const room of r.rooms)
                    if (room.venueId === edit.value)
                        room.venueId = old;
                r.rooms[edit.room].venueId = edit.value;
            }
            else {
                const assignment = r.rooms[edit.room].judges[edit.index], old = assignment.id;
                for (const room of r.rooms)
                    for (const j of room.judges)
                        if (j.id === edit.value)
                            j.id = old;
                assignment.id = edit.value;
            }
            for (const other of next.rounds) {
                const errors = validateDraw(next, other).errors.filter((e) => e !== tr("赛场缺少主裁"));
                if (errors.length)
                    throw new Error(errors.join("；"));
            }
            if (next.randomMeta) {
                const m = next.randomMeta;
                const check = validateSchedule(next.rounds.map((r) => r.rooms.map((room) => room.teamIds.map((id) => m.teamOrder.indexOf(id)))), m.teamOrder.map((id) => next.teams.find((t) => t.id === id)!.name));
                if (check.max_pair_meetings > (next.randomMeta.options?.maxMeetings ?? 2))
                    throw new Error(tr("该调整会导致交手次数超过设定上限"));
            }
            if (r.bp) Object.assign(r.bp, analyzeBPRound(next, r));
            if (next.randomMeta) delete next.randomMeta.resources;
            await update(next);
            setEdit(null);
            notify(tr("调整已保存并通过检查"));
        }
        catch (e) {
            notify(errorText(e), true);
        }
    }
    async function assign() {
        if (!round)
            return;
        try {
            const r = structuredClone(round);
            r.rooms.forEach((room) => (room.judges = []));
            assignJudges(p, r);
            await update({
                ...p,
                randomMeta: p.randomMeta ? {...p.randomMeta, resources:undefined} : undefined,
                rounds: p.rounds.map((old) => (old.id === r.id ? r : old)),
            });
            notify(tr("已分配本轮裁判"));
        }
        catch (e) {
            notify(errorText(e), true);
        }
    }
    async function exportAction(action: () => void | Promise<void>) {
        setExporting(true);
        try {
            await action();
        }
        catch (e) {
            notify(errorText(e), true);
        }
        finally {
            setExporting(false);
        }
    }
    return (<>
      <PageTitle eyebrow="DRAW & PAIRING" title={tr("对阵编排")} description={tr("合理的对阵，让每一场比赛都值得期待。")} actions={<>{p.rounds.length > 0 && <ReportExport p={p} kind="draw" notify={notify} label={tr("整套赛程")}/>}
            <Button variant="outline" disabled={busy} onClick={() => {
                setSeed(String(crypto.getRandomValues(new Uint32Array(1))[0]));
                setRandomOpen(true);
            }}>
              <Shuffle size={16}/>
              {tr("分层随机预排")}
            </Button>
            {!p.randomMeta && p.rounds.length < (p.settings.preliminaryRounds ?? 4) && <Button onClick={() => void power()} disabled={busy || p.rounds.some(r => !completeRound(r) || r.rooms.some(room => room.drafts?.some(d => d.judgeId === 'official')))}>
              <Plus size={16}/>
              {tr("生成第")}
              {(p.rounds.at(-1)?.no ?? 0) + 1}
              {tr("轮")}
            </Button>}
          </>}/>
      {!p.rounds.length && <EventPlanSummary p={p}/>}
      {reportError && (<div className="warning-note" role="alert">
          {tr(reportError)}
        </div>)}
      {report && (<div className="random-summary">
          <div className="summary-icon">
            <ShieldCheck size={24}/>
          </div>
          <div>
            <strong>{report.coverage_optimal ? tr("对手覆盖最优已验证") : tr("四轮排程校验通过")}</strong>
            <p>
              {tr("每队四辩位各一次 · 种子")}
              {p.randomMeta?.seed} ·{" "}
              {tr("分层随机预排")}
            </p>
          </div>
          <div className="summary-value">
            <b>
              {Math.min(...report.teams.map((t) => t.distinct_opponents))}–
              {Math.max(...report.teams.map((t) => t.distinct_opponents))}
            </b>
            <span>{tr("不同对手 / 队")}</span>
          </div>
          {report.strength && <div className="summary-value"><b>{report.strength.marked}</b><span>{report.strength.optimal ? tr('遇强次数均衡目标已达成') : tr('强队标签已参与编排')}</span></div>}
          {p.randomMeta?.resources && <div className="summary-value"><b>{p.randomMeta.resources.venueMax}</b><span>{tr('同场地最多次数')}</span></div>}
          {p.randomMeta?.resources && <div className="summary-value"><b>{p.randomMeta.resources.judgeMax}</b><span>{tr('同裁判最多次数')}</span></div>}
          <div className="summary-value">
            <b>{report.max_pair_meetings}</b>
            <span>{tr("最多交手次数")}</span>
          </div>
          <Button variant="outline" disabled={exporting} onClick={() => void exportAction(() => exportScheduleZIP(p))}>
            <Download size={16}/>
            {tr("导出完整 ZIP")}
          </Button>
        </div>)}
      {report && !report.coverage_optimal && p.randomMeta?.mode === 'random-new' && p.randomMeta.options?.maxMeetings === 2 && <div className="warning-note">{tr('当前约束下未达到每队九个不同对手，可调整回避设置后重新生成。')}</div>}
      {round?.bp && (() => { const audit = analyzeBPRound(p, round); return <div className="random-summary"><div><strong>BP Power Match</strong><p>{tr('种子 {0} · 升池 {1} 队 · 重复交手 {2} 对', [round.bp.seed, audit.pullups.length, audit.repeatedPairs])}</p></div><div className="summary-value"><b>{audit.repeatPositionTeams.length}</b><span>{tr('重复辩位队伍')}</span></div></div>; })()}
      {!round ? (<Panel title={tr("准备好你的第一轮对阵")} description={tr("选择适合当前赛事的编排方式。")}>
          <div className="draw-options">
            <button onClick={() => void power()}>
              <></>
              <Badge>{tr("按轮次生成")}</Badge>
              <h3>BP Power Match</h3>
              <p>
                {tr("首轮随机，后续按队伍积分池逐轮编排。")}
                <br />
                {tr("兼顾升池公平、辩位平衡与重复交手。")}
              </p>
              <span>
                {tr("生成首轮对阵")}
                <ArrowRight size={16}/>
              </span>
            </button>
            <button onClick={() => {
                setSeed(String(crypto.getRandomValues(new Uint32Array(1))[0]));
                setRandomOpen(true);
            }}>
              <></>
              <Badge tone="orange">{tr("{0} 队 · 4 轮 · {1} 赛场", [activeTeams.length, activeTeams.length / 4])}</Badge>
              <h3>{tr("分层随机预排")}</h3>
              <p>
                {tr("一次生成四轮，先优化对手分组。")}
                <br />
                {tr("二分图匹配保证四辩位各一次。")}
              </p>
              <span>
                {tr("配置随机编排")}
                <ArrowRight size={16}/>
              </span>
            </button>
          </div>
          <div className="panel-foot">
            <Upload size={16}/>
            <></>
            <Button variant="ghost" size="sm" onClick={() => file.current?.click()}>
              {tr("导入首轮")}
            </Button>
          </div>
        </Panel>) : (<>
          <section className="panel">
            <div className="table-toolbar">
              <div className="round-tabs">
                {p.rounds.map((r) => (<button key={r.id} className={r.no === round.no ? "selected" : ""} onClick={() => setSelected(r.no)}>
                    <span>R{r.no}</span>
                    {tr("第")}
                    {r.no}
                    {tr("轮")}
                    {completeRound(r) && <CheckCircle2 size={13}/>}
                  </button>))}
              </div>
              <Badge tone={completeRound(round) ? "green" : "orange"}>
                {completeRound(round) ? tr("成绩已完成") : tr("待录入成绩")}
              </Badge>
            </div>
            <div className="draw-toolbar">
              <div className="draw-meta">{round.timeSlot && <span>{round.timeSlot}</span>}<span>{round.rooms.length} {tr('个赛场')}</span><span>{round.rooms.length * 4} {tr('支队伍')}</span></div>
              <div>
                <Button size="sm" variant="ghost" onClick={() => setChecking(true)}>
                  <ShieldCheck size={15}/>
                  {tr("检查对阵")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => file.current?.click()}>
                  <Upload size={15}/>
                  {tr("导入本轮对阵")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void assign()} disabled={round.rooms.some((room) => room.results.length || room.drafts?.length || (room.ballots?.length ?? 0) > 0)}>
                  <Scale size={15}/>
                  {tr("分配裁判")}
                </Button>
                <Button size="sm" variant="outline" onClick={() => go("results")}>
                  {tr("录入成绩")}
                  <ArrowRight size={14}/>
                </Button>
              </div>
            </div>
            <TableFrame>
              <table className="draw-table">
                <thead>
                  <tr>
                    <th>{tr("赛场")}</th>
                    {POSITIONS.map((pos, i) => (<th key={pos}>
                        <span className={`position-label pos-${i}`}>{pos}</span>
                        <small>
                          {[
                    tr("开篇正方"),
                    tr("开篇反方"),
                    tr("结辩正方"),
                    tr("结辩反方"),
                ][i]}
                        </small>
                      </th>))}
                    <th>{tr("裁判组")}</th>
                  </tr>
                </thead>
                <tbody>
                  {round.rooms.map((room, ri) => (<tr key={room.id}>
                      <td>
                        <button className="venue-cell editable" onClick={() => setEdit({
                    room: ri,
                    kind: "venue",
                    index: 0,
                    value: room.venueId,
                })}>
                          <span className="small-mono">
                            ROOM {String(ri + 1).padStart(2, "0")}
                          </span>
                          <strong>
                            {p.venues.find((v) => v.id === room.venueId)?.name}
                          </strong>
                          <Pencil size={12}/>
                        </button>
                        {round.bp && <small>{tr('积分池 {0} 分',[round.bp.brackets[ri]?.level])}</small>}
                      </td>
                      {room.teamIds.map((id, i) => {
                    const t = p.teams.find((t) => t.id === id)!;
                    return (<td key={id} data-label={POSITIONS[i]}>
                            <button className="team-cell editable" disabled={room.results.length > 0 || !!room.drafts?.length ||
                            !!room.ballots?.length} onClick={() => setEdit({
                            room: ri,
                            kind: "team",
                            index: i,
                            value: id,
                        })}>
                              <strong>{t.name}</strong>
                              {p.randomMeta?.strongTeamIds?.includes(id) && <Badge tone="orange">{tr("强队")}</Badge>}
                              {round.bp && analyzeBPRound(p,round).pullups.includes(id) && <Badge tone="orange">{tr('升池')}</Badge>}
                              <p>
                                {t.speaker1 || "—"} / {t.speaker2 || "—"}
                              </p>
                              <small>{t.institution || tr("独立队伍")}</small>
                            </button>
                          </td>);
                })}
                      <td>
                        {room.judges.length ? (room.judges.map((j, i) => (<button key={j.id} className="judge-cell editable" disabled={room.results.length > 0 || !!room.drafts?.length ||
                        !!room.ballots?.length} onClick={() => setEdit({
                        room: ri,
                        kind: "judge",
                        index: i,
                        value: j.id,
                    })}>
                              <span className={j.role === "Chair" ? "chair-label" : "subtle"}>
                                {j.role === "Chair"
                        ? tr("主裁")
                        : j.role === "Panel"
                            ? tr("副裁")
                            : tr("计时")}
                              </span>
                              {p.judges.find((a) => a.id === j.id)?.name}
                            </button>))) : (<span className="text-amber-700 text-sm">
                            {tr("待分配裁判")}
                          </span>)}
                        <button className="edit-panel-link" disabled={room.results.length > 0 || !!room.drafts?.length || !!room.ballots?.length} onClick={() => setPanelRoom(ri)}>
                          {tr("编辑裁判组")}
                        </button>
                      </td>
                    </tr>))}
                </tbody>
              </table>
            </TableFrame>
            <div className="table-footer">
              <></>
              <span className="small-mono">ROUND {round.no}</span>
            </div>
          </section>
          {validation &&
                (validation.errors.length > 0 ||
                    validation.warnings.length > 0) && (<div className="warning-note">
                <TriangleAlert size={18}/>
                <div>
                  <strong>
                    {validation.errors.length
                    ? tr("有待处理的编排问题")
                    : tr("有需要复核的回避提醒")}
                  </strong>
                  <p>
                    {[...validation.errors, ...validation.warnings]
                    .slice(0, 2)
                    .join("；")}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setChecking(true)}>
                  {tr("查看全部")}
                </Button>
              </div>)}
          <Panel title={tr("导出本轮对阵")} description={tr("从现场投屏，到裁判评分单。")}>
            <div className="export-buttons"><ReportExport p={p} kind="draw" round={round} notify={notify}/>
              <Button variant="outline" onClick={() => exportCSV(drawRows(p, round), tr("Round-{0}-对阵.csv", [round.no]))}>
                <Download size={16}/>
                {tr("对阵 CSV")}
              </Button>
              <Button variant="outline" onClick={() => exportHTML(p, round)}>
                Overview HTML
              </Button>
              <Button variant="outline" onClick={() => exportHTML(p, round, true)}>
                {tr("Ballot 评分单")}
              </Button>
              <Button variant="outline" disabled={exporting} onClick={() => void exportAction(() => exportPPT(p, round))}>
                {tr("PPTX 演示文稿")}
              </Button>
            </div>
          </Panel>
          {report && (<Panel title={tr("辩位与对手校验")} description={tr("逐队查看四轮辩位及不同对手数量。")}>
              <TableFrame>
                <table>
                  <thead>
                    <tr>
                      <th>{tr("队伍")}</th>
                      {p.rounds.map((r) => (<th key={r.id}>
                          {tr("第")}
                          {r.no}
                          {tr("轮")}
                        </th>))}
                      <th>{tr("不同对手数")}</th>
                      <th>{tr("最多交手次数")}</th>
                      <th>{tr("同场地最多次数")}</th>
                      <th>{tr("同裁判最多次数")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.teams.map((t) => (<tr key={t.name}>
                        <td>
                          <strong>{t.name}</strong>
                        </td>
                        {t.roles.map((r, i) => (<td key={i}>
                            <Badge>{r}</Badge>
                          </td>))}
                        <td>{t.distinct_opponents} / 11</td>
                        <td>{teamAudit.get(t.name)?.opponents ?? 0}</td>
                        <td>{teamAudit.get(t.name)?.venues ?? 0}</td>
                        <td>{teamAudit.get(t.name)?.judges || "—"}</td>
                      </tr>))}
                  </tbody>
                </table>
              </TableFrame>
            </Panel>)}
        </>)}
      <input ref={file} type="file" className="hidden" accept=".csv,.xlsx,.xlsm" aria-label={tr("导入首轮对阵")} onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f)
                return;
            try {
                const next = await importRoundDraw(f, p, round?.no ?? 1);
                await update(next);
                setSelected(round?.no ?? 1);
                notify(tr("对阵已导入并保存"));
            }
            catch (e) {
                notify(errorText(e), true);
            }
            finally {
                e.target.value = "";
            }
        }}/>
      {panelRoom !== null && round && (<PanelEditor {...{ p, update, notify, go }} round={round} room={round.rooms[panelRoom]} onClose={() => setPanelRoom(null)}/>)}
      <Modal title={tr('强队标签')} open={strongOpen} onClose={() => setStrongOpen(false)}>
        <div className="strong-team-list">{p.teams.map(team => <button type="button" key={team.id} className={team.isStrong ? 'strong-team-option selected' : 'strong-team-option'} aria-pressed={!!team.isStrong} disabled={tagBusy || scoresExist || !team.active} onClick={() => void toggleStrong(team.id)}><span><strong>{team.name}</strong><small>{[team.speaker1, team.speaker2].filter(Boolean).join(' / ')}</small></span>{team.isStrong && <Badge tone="orange">{tr('强队')}</Badge>}{!team.active && <span>{tr('已停用')}</span>}</button>)}</div>
        <div className="modal-actions"><Button onClick={() => setStrongOpen(false)}>{tr('完成')}</Button></div>
      </Modal>
      <Modal title={tr("分层随机预排")} description={tr("根据启用队伍和场地编排四轮，每场四队，四个辩位各一次。")} open={randomOpen} onClose={() => {
            if (!busy)
                setRandomOpen(false);
        }}>
        <div className="entity-form">
          <></>
          <div className="form-grid"><label>{tr('最多交手次数')}<input type="number" min="1" max="4" value={options.maxMeetings} onChange={e => setOptions({ ...options, maxMeetings: Number(e.target.value) })} disabled={busy}/></label></div><div className="form-grid"><label>{tr('同校回避方式')}<select value={options.schoolAvoidance} onChange={e => setOptions({ ...options, schoolAvoidance: e.target.value as DrawOptions['schoolAvoidance'] })} disabled={busy}><option value="off">{tr('不回避')}</option><option value="prefer">{tr('尽量回避')}</option><option value="strict">{tr('严格回避')}</option></select></label><label>{tr('搜索强度')}<select value={options.searchDepth} onChange={e => setOptions({ ...options, searchDepth: e.target.value as DrawOptions['searchDepth'] })} disabled={busy}><option value="standard">{tr('标准')}</option><option value="deep">{tr('深度搜索')}</option></select></label></div><label>
            {tr("随机种子")}
            <div className="input-action">
              <input type="number" min="0" max="4294967295" value={seed} onChange={(e) => setSeed(e.target.value)} disabled={busy}/>
              <Button variant="outline" type="button" disabled={busy} onClick={() => setSeed(String(crypto.getRandomValues(new Uint32Array(1))[0]))}>
                <Shuffle size={15}/>
                {tr("换一个")}
              </Button>
            </div>
          </label>
          <></>
          <div className="strong-tag-controls"><Button variant="outline" type="button" onClick={() => setStrongOpen(true)} disabled={busy || scoresExist}>{tr('强队标签')} · {strongTeams.length}</Button><div className="strong-tags">{strongTeams.map(team => <Badge key={team.id} tone="orange">{team.name}</Badge>)}</div></div>
          {busy && (<div className="generation-progress">
              <div>
                <i style={{
                width: `${Math.max(3, progress * 100)}%`,
            }}/>
              </div>
              <p>
                {tr("正在搜索分组并匹配辩位…")}
                {Math.round(progress * 100)}%
              </p>
            </div>)}
          <div className="modal-actions">
            <Button variant="outline" onClick={() => {
            workerRef.current?.terminate();
            setBusy(false);
            setRandomOpen(false);
        }}>
              {busy ? tr("取消生成") : tr("取消")}
            </Button>
            <Button onClick={random} disabled={busy || scoresExist}>
              <Shuffle size={16}/>
              {busy ? tr("生成中…") : tr("生成并校验四轮")}
            </Button>
          </div>
          {scoresExist && (<p className="text-sm text-amber-800">
              {tr("已有成绩或裁判评分，不能重新排阵")}
            </p>)}
        </div>
      </Modal>
      <Modal title={tr("调整{0}", [
            edit?.kind === "team"
                ? tr("参赛队伍")
                : edit?.kind === "judge"
                    ? tr("裁判")
                    : tr("场地"),
        ])} description={tr("若选择本轮已使用的队伍、裁判或场地，将交换双方位置。调整后会重新校验辩位约束。")} open={!!edit} onClose={() => setEdit(null)}>
        {edit && (<div className="entity-form">
            <label>
              {tr("选择")}
              {edit.kind === "team"
                ? tr("队伍")
                : edit.kind === "judge"
                    ? tr("裁判")
                    : tr("场地")}
              <select value={edit.value} onChange={(e) => setEdit({
                ...edit,
                value: e.target.value,
            })}>
                {(edit.kind === "team"
                ? p.teams
                : edit.kind === "judge"
                    ? p.judges
                    : p.venues)
                .filter((x) => x.active)
                .map((t) => (<option key={t.id} value={t.id}>
                      {t.name}
                    </option>))}
              </select>
            </label>
            <div className="modal-actions">
              <Button variant="outline" onClick={() => setEdit(null)}>
                {tr("取消")}
              </Button>
              <Button onClick={() => void applyEdit()}>{tr("保存调整")}</Button>
            </div>
          </div>)}
      </Modal>
      <Modal title={tr("对阵检查")} open={checking} onClose={() => setChecking(false)}>
        {validation && (<div className="validation-list">
            {!validation.errors.length && !validation.warnings.length ? (<Empty title={tr("对阵检查通过")} description={tr("队伍、场地、裁判和辩位检查均未发现问题。")}/>) : (<>
                {validation.errors.map((e) => (<p key={e} className="text-red-700">
                    <TriangleAlert size={16}/>
                    {e}
                  </p>))}
                {validation.warnings.map((e) => (<p key={e} className="text-amber-800">
                    <TriangleAlert size={16}/>
                    {e}
                  </p>))}
              </>)}
          </div>)}
      </Modal>
    </>);
}
