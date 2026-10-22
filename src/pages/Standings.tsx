import {TableFrame} from '@/components/shared';
import { ReportExport } from '@/components/ReportExport';
import { t as tr } from "@/lib/i18n";
import { useState } from "react";
import { Download, Trophy, Medal } from "lucide-react";
import { PageTitle, SearchBox, Badge, type PageProps, } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { teamStandings, speakerStandings } from "@/lib/standings";
import { exportStandings } from "@/lib/export";
export default function Standings({ p, notify }: PageProps) {
    const [speakers, setSpeakers] = useState(false), [query, setQuery] = useState(""), [cutoff, setCutoff] = useState("all");
    const scoped = {
        ...p,
        rounds: p.rounds.filter((r) => cutoff === "all" || r.no <= Number(cutoff)),
    };
    const teams = teamStandings(scoped), people = speakerStandings(scoped);
    return (<>
      <PageTitle eyebrow="STANDINGS" title={tr("积分与排名")} description={tr("看见每一次进步，也看见每一种可能。")} actions={<><ReportExport p={scoped} kind={speakers ? "speakers" : "teams"} notify={notify}/><Button variant="outline" onClick={() => exportStandings(scoped, speakers)}>
            <Download size={16}/>
            {tr("导出")}
            {speakers ? tr("辩手") : tr("队伍")}
            {tr("排名 CSV")}
          </Button></>}/>
      <div className="standings-banner">
        <></>
        <div>
          <></>
          <p>
            {speakers
            ? tr("按个人总分 → 均分 → 姓名排序")
            : tr("按队伍积分 → 辩手总分 → 队名排序")}
          </p>
        </div>
        <div className="standings-round-select">
          <label htmlFor="cutoff">{tr("统计轮次")}</label>
          <select id="cutoff" value={cutoff} onChange={(e) => setCutoff(e.target.value)}>
            <option value="all">{tr("全部轮次")}</option>
            {p.rounds.map((r) => (<option key={r.id} value={r.no}>
                {tr("截至第")}
                {r.no}
                {tr("轮")}
              </option>))}
          </select>
        </div>
      </div>
      <section className="panel">
        <div className="table-toolbar">
          <div className="segmented">
            <button className={!speakers ? "selected" : ""} onClick={() => setSpeakers(false)}>
              {tr("队伍排名")}
            </button>
            <button className={speakers ? "selected" : ""} onClick={() => setSpeakers(true)}>
              {tr("辩手排名")}
            </button>
          </div>
          <SearchBox value={query} onChange={setQuery} placeholder={tr("搜索名称或学校…")}/>
        </div>
        <TableFrame>
          <table>
            <thead>
              <tr>
                <th className="num-col">{tr("排名")}</th>
                <th>{speakers ? tr("辩手") : tr("队伍")}</th>
                <th>{tr("学校 / 单位")}</th>
                {speakers ? <th>{tr("所属队伍")}</th> : <th>{tr("状态")}</th>}
                <th>{tr("有效轮次")}</th>
                {!speakers && <th>{tr("队伍积分")}</th>}
                <th>{speakers ? tr("个人总分") : tr("辩手总分")}</th>
                <th>{tr("均分")}</th>
              </tr>
            </thead>
            <tbody>
              {speakers
            ? people
                .map((t, i) => ({
                ...t,
                rank: i + 1,
            }))
                .filter((t) => `${t.name} ${t.institution} ${t.team}`
                .toLowerCase()
                .includes(query.toLowerCase()))
                .map((t) => (<tr key={t.id}>
                        <td>
                          <Rank n={t.rank}/>
                        </td>
                        <td>
                          <strong>{t.name}</strong>
                        </td>
                        <td>{t.institution || "—"}</td>
                        <td>{t.team}</td>
                        <td>{t.rounds}</td>
                        <td className="font-semibold tabular-nums">
                          {t.total.toFixed(2)}
                        </td>
                        <td>{t.average.toFixed(2)}</td>
                      </tr>))
            : teams
                .map((t, i) => ({
                ...t,
                rank: i + 1,
            }))
                .filter((t) => `${t.name} ${t.institution}`
                .toLowerCase()
                .includes(query.toLowerCase()))
                .map((t) => (<tr key={t.id}>
                        <td>
                          <Rank n={t.rank}/>
                        </td>
                        <td>
                          <strong>{t.name}</strong>
                          {t.secondLanguage && (<span className="ml-2">
                              <Badge tone="blue">{tr("二语")}</Badge>
                            </span>)}
                        </td>
                        <td>{t.institution || "—"}</td>
                        <td>
                          <Badge tone={t.active ? "green" : "gray"}>
                            {t.active ? tr("启用") : tr("停用")}
                          </Badge>
                        </td>
                        <td>{t.rounds}</td>
                        <td className="points-cell">
                          {t.points}
                          <span> pts</span>
                        </td>
                        <td className="tabular-nums">{t.total.toFixed(2)}</td>
                        <td>{t.average.toFixed(2)}</td>
                      </tr>))}
            </tbody>
          </table>
          {(speakers ? people : teams).length === 0 && (<div className="empty-state">
              <Medal size={34}/>
              <h3>{tr("暂无排名")}</h3>
              <></>
            </div>)}
        </TableFrame>
        <div className="table-footer">
          <></>
          <span>
            {speakers ? people.length : teams.length}
            {tr("条记录")}
          </span>
        </div>
      </section>
    </>);
}
function Rank({ n }: {
    n: number;
}) {
    return (<span className={`rank-number ${n <= 3 ? `r${n - 1}` : ""}`}>
      {String(n).padStart(2, "0")}
    </span>);
}
