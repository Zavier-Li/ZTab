import { EventPlanSummary } from "@/components/EventPlan";
import { t as tr } from "@/lib/i18n";
import { ArrowRight, Check, ChevronRight, Clock3, ShieldCheck, Download, } from "lucide-react";
import { Badge, PageTitle, Panel, LinkButton, type PageProps, } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { teamStandings } from "@/lib/standings";
import { completeRound } from "@/lib/types";
import { exportJSON } from "@/lib/export";
export default function Dashboard({ p, go }: PageProps) {
    const teams = p.teams.filter((t) => t.active).length, judges = p.judges.filter((j) => j.active).length, venues = p.venues.filter((v) => v.active).length, completed = p.rounds.filter(completeRound).length;
    const finished = p.rounds.length > 0 && completed === p.rounds.length && (!!p.randomMeta || completed >= (p.settings.preliminaryRounds ?? 4));
    const checks = [
        {
            label: tr("导入参赛队伍"),
            detail: tr("队名、辩手与所属学校"),
            ready: teams > 0 && teams % 4 === 0,
            page: "teams",
        },
        {
            label: tr("安排裁判与场地"),
            detail: tr("确认裁判可用轮次与赛场"),
            ready: judges >= teams / 4 && venues >= teams / 4 && teams > 0,
            page: "judges",
        },
        {
            label: tr("生成首轮对阵"),
            detail: tr("自动编排，或导入现有对阵"),
            ready: p.rounds.length > 0,
            page: "draw",
        },
    ];
    const ranked = teamStandings(p)
        .filter((t) => t.rounds)
        .slice(0, 5);
    const next = finished ? "standings" : p.rounds.some((r) => !completeRound(r))
        ? "results"
        : teams
            ? "draw"
            : "teams";
    return (<>

      <section className="event-heading">
        <div>
          <div className="event-meta">
            <Badge tone={p.rounds.length ? "green" : "gray"}>
              {finished ? tr("完赛") : p.rounds.length ? tr("赛事进行中") : tr("赛事筹备中")}
            </Badge>
            <span>
              BP / {p.randomMeta ? tr("最优分层随机预排") : "BP Power Match"}
            </span>
          </div>
          <h2>{p.name}</h2>
          <></>
        </div>
        <Button onClick={() => go(next)}>
          {next === "standings" ? tr("查看排名") : next === "results"
            ? tr("录入本轮成绩")
            : next === "teams"
                ? tr("添加参赛队伍")
                : tr("前往对阵编排")}
          <ArrowRight size={16}/>
        </Button>
      </section>
      <div className="stats-grid">
        {[
            {
                label: tr("参赛队伍"),
                value: teams,
                unit: tr("支"),
                detail: tr("{0} 位辩手", [teams * 2]),
                page: "teams",
            },
            {
                label: tr("在册裁判"),
                value: judges,
                unit: tr("位"),
                detail: tr("主裁 · 副裁 · 计时员"),
                page: "judges",
            },
            {
                label: tr("可用场地"),
                value: venues,
                unit: tr("间"),
                detail: teams
                    ? tr("本轮需 {0} 间赛场", [Math.ceil(teams / 4)])
                    : tr("等待队伍就位"),
                page: "venues",
            },
            {
                label: tr("已完成轮次"),
                value: completed,
                unit: tr("轮"),
                detail: tr("共 {0} 轮已编排", [p.rounds.length]),
                page: "results",
            },
        ].map((s) => (<button className="stat-card" key={s.label} onClick={() => go(s.page)}>
            <div className="stat-top">
              <span>{s.label}</span>
              <ChevronRight size={14}/>
            </div>
            <div className="stat-value">
              {String(s.value).padStart(2, "0")}
              <span>{s.unit}</span>
            </div>
            <p>{s.detail}</p>
          </button>))}
      </div>
      <div className="dashboard-columns">
        <Panel title={p.rounds.length ? tr("轮次动态") : tr("开赛准备")} description={p.rounds.length
            ? tr("查看每一轮编排与成绩状态。")
            : tr("完成准备，开始第一轮。")} action={<span className="small-mono">
              {p.rounds.length
                ? `${completed} / ${p.rounds.length}`
                : `${checks.filter((c) => c.ready).length} / 3`}
            </span>}>
          {p.rounds.length ? (<div className="round-list">
              {p.rounds.map((r) => (<button key={r.id} onClick={() => go("results")}>
                  <span className={`step-number ${completeRound(r) ? "done" : ""}`}>
                    {completeRound(r) ? (<Check size={16}/>) : (<Clock3 size={16}/>)}
                  </span>
                  <div>
                    <strong>
                      {tr("第")}
                      {r.no}
                      {tr("轮")}
                    </strong>
                    <p>
                      {r.rooms.length}
                      {tr("个赛场 ·")}
                      {r.rooms.filter((room) => room.results.length === 4)
                    .length}
                      {tr("份成绩已提交")}
                    </p>
                  </div>
                  <Badge tone={completeRound(r) ? "green" : "orange"}>
                    {completeRound(r) ? tr("已完成") : tr("待录入成绩")}
                  </Badge>
                  <ChevronRight size={16}/>
                </button>))}
            </div>) : (<div className="checklist">
              {checks.map((item, i) => (<button key={item.label} onClick={() => go(item.page)}>
                  <span className={`step-number ${item.ready ? "done" : ""}`}>
                    {item.ready ? (<Check size={17}/>) : (String(i + 1).padStart(2, "0"))}
                  </span>
                  <div>
                    <strong>{item.label}</strong>
                    <p>{item.detail}</p>
                  </div>
                  {item.ready ? (<Badge tone="green">{tr("已就绪")}</Badge>) : (<ChevronRight size={17}/>)}
                </button>))}
            </div>)}
          <></>
        </Panel>
        <Panel title={tr("队伍积分榜")} description={tr("按已保存的正式成绩更新。")} action={<LinkButton onClick={() => go("standings")}>
              {tr("完整排名")}
            </LinkButton>}>
          {ranked.length ? (<div className="mini-rank">
              {ranked.map((t, i) => (<div key={t.id}>
                  <span className={`rank-number r${i}`}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <strong>{t.name}</strong>
                    <p>{t.institution || tr("独立队伍")}</p>
                  </div>
                  <b>
                    {t.points}
                    <small> pts</small>
                  </b>
                </div>))}
            </div>) : (<div className="ranking-empty">
              <></>
              <h3>{tr("暂无正式成绩")}</h3>
              <></>
              <Button variant="ghost" size="sm" onClick={() => go("standings")}>
                {tr("查看排名规则")}
                <ArrowRight size={14}/>
              </Button>
            </div>)}
        </Panel>
      </div>
      {!p.rounds.length && <EventPlanSummary p={p}/>}
      <></>
      <></>
    </>);
}
