import {TableFrame} from '@/components/shared';
import type { Project } from "@/lib/types";
import { t as tr } from "@/lib/i18n";
import { Panel } from "./shared";
export function EventPlanSummary({ p }: {
    p: Project;
}) {
    if (!p.eventPlan)
        return null;
    const plan = p.eventPlan;
    return (<Panel title={tr("赛前场次安排")} description={tr("现场随机生成队伍对阵；以下时间、场地与裁判安排将一并载入。")}>
      <TableFrame>
        <table>
          <thead>
            <tr>
              <th>{tr("轮次")}</th>
              <th>{tr("比赛时间")}</th>
              {plan.venueIds.map((id) => (<th key={id}>{p.venues.find((v) => v.id === id)?.name}</th>))}
            </tr>
          </thead>
          <tbody>
            {plan.timeSlots.map((time, r) => (<tr key={r}>
                <td>
                  {tr("第")}
                  {r + 1}
                  {tr("轮")}
                </td>
                <td className="tabular-nums">{time}</td>
                {plan.judgePanels[r].map((panel, i) => (<td key={i}>
                    {panel
                    .map((id) => p.judges.find((j) => j.id === id)?.name)
                    .join(" / ")}
                  </td>))}
              </tr>))}
          </tbody>
        </table>
      </TableFrame>
      <div className="panel-foot">
        Tab: {plan.tabOperator}
        <span className="ml-auto">{tr("未生成对阵 · 未录入成绩")}</span>
      </div>
    </Panel>);
}
export function EventPlanFields({ p }: {
    p: Project;
}) {
    if (!p.eventPlan)
        return null;
    const plan = p.eventPlan, locked = p.rounds.length > 0;
    return (<div className="event-plan-fields">
      <h3>{tr("赛前场次安排")}</h3>
      <p className="subtle text-sm">
        {tr("原脚本未区分主副裁，暂按每组首位为主裁、其余为副裁，可在此修改。")}
      </p>
      <label>
        Tab
        <input name="tabOperator" defaultValue={plan.tabOperator}/>
      </label>
      <div className="form-grid">
        {plan.venueIds.map((id, i) => (<label key={id}>
            {tr("赛场")} {i + 1}
            <select name={`plan-venue-${i}`} defaultValue={id} disabled={locked}>
              {p.venues
                .filter((v) => v.active)
                .map((v) => (<option key={v.id} value={v.id}>
                    {v.name}
                  </option>))}
            </select>
          </label>))}
      </div>
      {plan.timeSlots.map((time, r) => (<section key={r}>
          <h4>
            {tr("第")}
            {r + 1}
            {tr("轮")}
          </h4>
          <label>
            {tr("比赛时间")}
            <input name={`plan-time-${r}`} required defaultValue={time}/>
          </label>
          {plan.judgePanels[r].map((panel, v) => (<div className="plan-room" key={v}>
              <strong>
                {p.venues.find((x) => x.id === plan.venueIds[v])?.name}
              </strong>
              <div className="form-grid">
                <label>
                  {tr("主裁")}
                  <select name={`plan-chair-${r}-${v}`} defaultValue={panel[0]} disabled={locked}>
                    {p.judges
                    .filter((j) => j.active)
                    .map((j) => (<option key={j.id} value={j.id}>
                          {j.name}
                        </option>))}
                  </select>
                </label>
                <label>
                  {tr("副裁")}
                  <select name={`plan-panels-${r}-${v}`} defaultValue={panel.slice(1)} multiple size={3} disabled={locked}>
                    {p.judges
                    .filter((j) => j.active)
                    .map((j) => (<option key={j.id} value={j.id}>
                          {j.name}
                        </option>))}
                  </select>
                </label>
              </div>
            </div>))}
        </section>))}
      {locked && (<p className="subtle text-sm">
          {tr("已生成对阵，请在对阵页面逐场修改裁判与场地。")}
        </p>)}
    </div>);
}
