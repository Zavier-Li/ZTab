import {persistScoreDraft, readScoreDraft} from '@/lib/score-autosave';
import type {ScoreDraft} from '@/lib/types';
import {TableFrame} from '@/components/shared';
import { ReportExport } from '@/components/ReportExport';
import { t as tr } from "@/lib/i18n";
import { useRef, useState, type FormEvent } from "react";
import { ArrowRight, Save, CheckCircle2, ClipboardList, LockKeyhole, Upload, Download, Check, } from "lucide-react";
import { PageTitle, Panel, Badge, Empty, type PageProps, } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { POSITIONS, completeRound, hasSubsequentPowerRound, type Room, type Round, type Result, } from "@/lib/types";
import { validateResults } from "@/lib/standings";
import { parseQuickRanks, importScores } from "@/lib/score-import";
import { exportCSV } from "@/lib/export";
import { errorText } from "@/lib/utils";
export default function Results(props: PageProps) {
    const { p, go, update, notify } = props;
    const [selected, setSelected] = useState(p.rounds.find((r) => !completeRound(r))?.no ?? p.rounds.at(-1)?.no ?? 1), [view, setView] = useState("entry"), [revision, setRevision] = useState(0);
    const file = useRef<HTMLInputElement>(null);
    const r = p.rounds.find((r) => r.no === selected) ?? p.rounds.at(-1);
    const locked = !!r && hasSubsequentPowerRound(p, r.no);
    function template() {
        if (!r)
            return;
        exportCSV([
            [
                tr("轮次"),
                tr("场地"),
                tr("队名"),
                tr("裁判"),
                tr("辩手1分数"),
                tr("辩手2分数"),
                tr("名次"),
            ],
            ...r.rooms.flatMap((room) => room.teamIds.map((id, i) => [
                r.no,
                p.venues.find((v) => v.id === room.venueId)?.name,
                p.teams.find((t) => t.id === id)?.name,
                "",
                "",
                "",
                i + 1,
            ])),
        ], tr("Round-{0}-评分模板.csv", [r.no]));
    }
    return (<>
      <PageTitle eyebrow="BALLOTS & RESULTS" title={tr("成绩与评分")} description={tr("逐场记录，完整保留。裁判评分与正式成绩清楚可查。")} actions={<>{p.rounds.length > 0 && <ReportExport p={p} kind="results" notify={notify}/>}
            <Button variant="outline" onClick={() => file.current?.click()}>
              <Upload size={16}/>
              {tr("导入评分")}
            </Button>
            <Button variant="outline" onClick={() => go("standings")}>
              {tr("查看排名")}
              <ArrowRight size={16}/>
            </Button>
          </>}/>
      <input type="file" ref={file} className="hidden" aria-label={tr("导入评分文件")} accept=".csv,.xlsx,.xlsm" onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f)
                return;
            try {
                await update(await importScores(f, p));
                setRevision(v => v + 1);
                notify(tr("评分已导入并保存"));
            }
            catch (e) {
                notify(errorText(e), true);
            }
            finally {
                e.target.value = "";
            }
        }}/>
      <div className="results-heading">
        <div className="segmented">
          <button className={view === "entry" ? "selected" : ""} onClick={() => setView("entry")}>
            {tr("录入与编辑")}
          </button>
          <button className={view === "all" ? "selected" : ""} onClick={() => setView("all")}>
            {tr("逐场完整结果")}
          </button>
        </div>
        <Button variant="ghost" size="sm" onClick={template} disabled={!r}>
          <Download size={15}/>
          {tr("下载评分模板")}
        </Button>
      </div>
      {!r ? (<Panel title={tr("等待第一场比赛")}>
          <Empty title={tr("还没有可录入的轮次")} description={tr("生成或导入对阵后，在这里录入队伍排名与辩手分数。")} action={<Button onClick={() => go("draw")}>
                {tr("前往对阵编排")}
                <ArrowRight size={15}/>
              </Button>}/>
        </Panel>) : view === "all" ? (<>
          {p.rounds.map((round) => (<Panel key={round.id} title={tr("第 {0} 轮 · 完整赛场结果", [round.no])} description={tr("{0} / {1} 场正式成绩已提交", [
                    round.rooms.filter((room) => room.results.length === 4).length,
                    round.rooms.length,
                ])}>
              <TableFrame>
                <table className="all-results-table">
                  <thead>
                    <tr>
                      <th>{tr("场地 / 裁判")}</th>
                      {POSITIONS.map((pos) => (<th key={pos}>{pos}</th>))}
                    </tr>
                  </thead>
                  <tbody>
                    {round.rooms.map((room) => (<tr key={room.id}>
                        <td>
                          <strong>
                            {p.venues.find((v) => v.id === room.venueId)?.name}
                          </strong>
                          <p className="subtle text-xs mt-2">
                            {room.judges
                        .map((j) => p.judges.find((a) => a.id === j.id)?.name)
                        .join(" / ") || tr("裁判待分配")}
                          </p>
                          <small className="subtle">
                            {room.ballots?.length ?? 0}
                            {tr("份裁判评分记录")}
                          </small>
                        </td>
                        {room.teamIds.map((id) => {
                        const t = p.teams.find((t) => t.id === id)!, rs = room.results.find((r) => r.teamId === id);
                        return (<td key={id}>
                              <strong>{t.name}</strong>
                              <p className="result-score">
                                {rs ? (<>
                                    <b>
                                      {tr("第{0}名", [rs.rank])}
                                    </b>
                                    <Badge tone="orange">
                                      {4 - rs.rank}
                                      {tr("分")}
                                    </Badge>
                                  </>) : (<span className="subtle">{tr("待录入")}</span>)}
                              </p>
                              <p className="subtle text-xs">
                                {t.speaker1 || tr("辩手 1")}：
                                {rs?.score1 ?? "—"}
                              </p>
                              <p className="subtle text-xs">
                                {t.speaker2 || tr("辩手 2")}：
                                {rs?.score2 ?? "—"}
                              </p>
                            </td>);
                    })}
                      </tr>))}
                  </tbody>
                </table>
              </TableFrame>
            </Panel>))}
        </>) : (<>
          <div className="results-heading">
            <div className="round-tabs">
              {p.rounds.map((round) => (<button className={r.no === round.no ? "selected" : ""} key={round.id} onClick={() => setSelected(round.no)}>
                  <span>R{round.no}</span>
                  {tr("第{0}轮", [round.no])}
                  {completeRound(round) && <CheckCircle2 size={14}/>}
                </button>))}
            </div>
            <Badge tone={completeRound(r) ? "green" : "orange"}>
              {r.rooms.filter((room) => room.results.length === 4).length} /{" "}
              {r.rooms.length}
              {tr("份已提交")}
            </Badge>
          </div>
          <></>
          {locked && (<div className="warning-note">
              <LockKeyhole size={18}/>
              <span>
                {tr("后续成绩配对轮次已生成，本轮成绩已锁定，避免改变后续编排依据。")}
              </span>
            </div>)}
          {r.rooms.map((room, i) => (<ScoreRoom key={`${r.id}-${room.id}-${revision}`} {...props} room={room} round={r} index={i} locked={locked}/>))}
        </>)}
    </>);
}
function ScoreRoom({ p, room, round, index, locked, notify }: PageProps & {
    room: Room; round: Round; index: number; locked: boolean;
}) {
    const [expanded, setExpanded] = useState(false);
    const [judgeId, setJudge] = useState('official');
    const [draft, setDraft] = useState(() => readScoreDraft(room, 'official'));
    const current = useRef(draft);
    const cache = useRef(new Map<string, ScoreDraft>());
    const sequence = useRef(0);
    const [status, setStatus] = useState(room.drafts?.some(d => d.judgeId === 'official') ? (room.results.length === 4 ? 'pending' : 'draft') : room.results.length ? 'valid' : 'empty');
    const [error, setError] = useState('');
    function change(next: ScoreDraft, confirmRankChange = false) {
        current.current = next;
        cache.current.set(next.judgeId, next);
        setDraft(next);
        setStatus('saving');
        const seq = ++sequence.current;
        void persistScoreDraft(p.id, round.id, room.id, next, confirmRankChange).then(saved => {
            if (seq === sequence.current) { setStatus(saved.status); setError(saved.error); }
        }).catch(e => { if (seq === sequence.current) { setStatus('error'); setError(errorText(e)); notify(errorText(e), true); } });
    }
    function switchJudge(id: string) {
        ++sequence.current;
        const next = cache.current.get(id) ?? readScoreDraft(room, id);
        current.current = next; setDraft(next); setJudge(id); setError('');
        setStatus(room.drafts?.some(d => d.judgeId === id) ? ((id === 'official' ? room.results.length : room.ballots?.find(b => b.judgeId === id)?.results.length) === 4 ? 'pending' : 'draft') : next.ranks.every(Boolean) ? 'valid' : 'empty');
    }
    function field(key: 'ranks' | 'score1' | 'score2', i: number, value: string) {
        const next = {...current.current, [key]: current.current[key].map((v, j) => i === j ? value : v)};
        if (key === 'ranks') { next.quick = [...next.ranks].sort().join() === '1,2,3,4' ? next.ranks.join('') : ''; }
        change(next);
    }
    const venue = p.venues.find(v => v.id === room.venueId)?.name ?? tr('赛场 {0}', [index + 1]);
    return <section className="panel compact-score-room" onKeyDown={e => {
      if (e.key !== 'Enter' || locked) return;
      let next = current.current;
      const quickInput = (e.target as HTMLElement).hasAttribute('data-quick-ranks');
      const stored = judgeId === 'official' ? room.results : room.ballots?.find(b => b.judgeId === judgeId)?.results ?? [];
      if (!quickInput && (stored.length !== 4 || !room.teamIds.some((id, i) => stored.find(r => r.teamId === id)?.rank !== Number(next.ranks[i])))) return;
      e.preventDefault();
      try {
        if (quickInput) next = {...next, ranks: parseQuickRanks(next.quick).map(String)};
        parseQuickRanks(next.ranks.join(''));
        if (next.quick) parseQuickRanks(next.quick);
      } catch (error) { notify(tr(errorText(error)), true); return; }
      if (stored.length !== 4 || window.confirm(tr('确认修改本场名次？'))) change(next, true);
    }}>
      <div className="compact-score-toolbar">
        <h2><button type="button" className="score-room-toggle" aria-expanded={expanded} aria-controls={`scores-${room.id}`} onClick={() => setExpanded(v => !v)}>{venue}<span aria-hidden="true">{expanded ? "−" : "+"}</span></button></h2>
        <label>{tr('评分记录')}<select aria-label={`${venue} ${tr('评分记录')}`} value={judgeId} onChange={e => switchJudge(e.target.value)}>
          <option value="official">{tr('本场正式成绩')}</option>
          {room.judges.filter(j => j.role !== 'Timer').map(j => <option key={j.id} value={j.id}>{p.judges.find(a => a.id === j.id)?.name}</option>)}
        </select></label>
        <label>{tr('快捷名次')}<input data-quick-ranks aria-label={tr('{0} 快捷名次', [venue])} inputMode="numeric" maxLength={4} placeholder={tr("例：4132")} disabled={locked} value={draft.quick} onChange={e => {
          const next = {...current.current, quick: e.target.value};
          try { next.ranks = parseQuickRanks(e.target.value).map(String); } catch { /* Keep incomplete input as a draft. */ }
          change(next);
        }}/></label>
        <span className="compact-score-state" role="status" title={error}>{status === 'saving' ? tr('保存中…') : status === 'error' ? error : status === 'pending' ? tr('按 Enter 确认名次修改') : status === 'draft' ? tr('草稿已保存') : status === 'valid' ? tr('已保存') : tr('待录入')}</span>
        {judgeId !== 'official' && status === 'valid' && <Button size="sm" variant="outline" disabled={locked} onClick={() => { const next = {...current.current, judgeId: 'official'}; setJudge('official'); change(next); }}>{tr('确认为正式成绩')}</Button>}
      </div>
      <div id={`scores-${room.id}`} className="compact-score-grid" hidden={!expanded}>
        {room.teamIds.map((id, i) => {
          const team = p.teams.find(t => t.id === id)!;
          return <div className="compact-team-score" key={id}>
            <div className="compact-team-title"><span className={`position-label pos-${i}`}>{POSITIONS[i]}</span><strong>{team.name}</strong></div>
            <label className="compact-score-field"><span>{tr('本场名次')}</span><select aria-label={tr('{0} 排名', [team.name])} value={draft.ranks[i]} disabled={locked} onChange={e => field('ranks', i, e.target.value)}><option value="">{tr('选择排名')}</option>{[1,2,3,4].map(n => <option key={n} value={n}>{tr(['', '第1名 · 3分', '第2名 · 2分', '第3名 · 1分', '第4名 · 0分'][n])}</option>)}</select></label>
            {(['score1', 'score2'] as const).map((key, j) => <label className="compact-score-field" key={key}><span>{(j === 0 ? team.speaker1 : team.speaker2) || tr('辩手 {0}', [j+1])}</span><input aria-label={tr(j === 0 ? '{0} 辩手1分数' : '{0} 辩手2分数', [team.name])} type="number" min="60" max="100" step="0.01" placeholder={tr('可留空')} disabled={locked} value={draft[key][i]} onChange={e => field(key, i, e.target.value)}/></label>)}
          </div>;
        })}
      </div>
      {status === 'draft' && error && <p className="compact-score-error" role="alert">{tr(error)}</p>}
    </section>;
}
