import {TableFrame} from '@/components/shared';
import { t as tr } from "@/lib/i18n";
import { useRef, useState, type FormEvent } from "react";
import { Plus, Upload, Download, Pencil, Trash2, Users, Scale, MapPin, Check, } from "lucide-react";
import { PageTitle, SearchBox, Badge, Empty, type PageProps, } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { uid, type Team, type Judge, type Venue } from "@/lib/types";
import { readRecords, parseTeams, parseJudges, value } from "@/lib/import";
import { exportCSV } from "@/lib/export";
import { errorText } from "@/lib/utils";
type Entity = Team | Judge | Venue;
export default function People({ p, update, notify, kind, }: {
    kind: "teams" | "judges" | "venues";
} & PageProps) {
    const [query, setQuery] = useState(""), [filter, setFilter] = useState("all"), [editing, setEditing] = useState<Entity | null>(null), [deleting, setDeleting] = useState<Entity | null>(null), [page, setPage] = useState(1), [busy, setBusy] = useState(false);
    const file = useRef<HTMLInputElement>(null);
    const isTeams = kind === "teams", isJudges = kind === "judges";
    const title = isTeams
        ? tr("参赛队伍")
        : isJudges
            ? tr("裁判管理")
            : tr("场地管理"), unit = isTeams ? tr("支队伍") : isJudges ? tr("位裁判") : tr("个场地");
    const list = p[kind] as Entity[];
    const filtered = list.filter((t) => (filter === "all" || (filter === "active" ? t.active : !t.active)) &&
        [
            t.name,
            "institution" in t ? t.institution : "",
            "speaker1" in t ? t.speaker1 : "",
            "speaker2" in t ? t.speaker2 : "",
        ]
            .join(" ")
            .toLowerCase()
            .includes(query.toLowerCase()));
    const pages = Math.max(1, Math.ceil(filtered.length / 12)), current = Math.min(page, pages);
    const blank = (): Entity => isTeams
        ? {
            id: uid(),
            name: "",
            speaker1: "",
            speaker2: "",
            institution: "",
            secondLanguage: false,
            active: true,
        }
        : isJudges
            ? {
                id: uid(),
                name: "",
                institution: "",
                rating: 3,
                workTask: "",
                workTime: "",
                active: true,
                conflictInstitutions: [],
                conflictTeams: [],
            }
            : {
                id: uid(),
                name: "",
                active: true,
            };
    async function save(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!editing)
            return;
        const form = new FormData(e.currentTarget), text = (key: string) => String(form.get(key) ?? "").trim();
        const base = {
            ...editing,
            name: text("name"),
            active: form.has("active"),
        };
        const item: Entity = isTeams
            ? ({
                ...base,
                speaker1: text("speaker1"),
                speaker2: text("speaker2"),
                institution: text("institution"),
                secondLanguage: form.has("secondLanguage"),
            } as Team)
            : isJudges
                ? ({
                    ...base,
                    institution: text("institution"),
                    rating: Number(text("rating")),
                    workTask: text("workTask"),
                    workTime: text("workTime"),
                    conflictInstitutions: text("conflictInstitutions")
                        .split(/[,，、\n]/)
                        .map((s) => s.trim())
                        .filter(Boolean),
                    conflictTeams: form.getAll("conflictTeams").map(String),
                } as Judge)
                : (base as Venue);
        if (list.some((t) => t.id !== item.id && t.name.toLowerCase() === item.name.toLowerCase())) {
            notify(tr("该名称已存在"), true);
            return;
        }
        try {
            await update({
                ...p,
                [kind]: list.some((t) => t.id === item.id)
                    ? list.map((t) => (t.id === item.id ? item : t))
                    : [...list, item],
            });
            setEditing(null);
            notify(tr("已保存"));
        }
        catch (e) {
            notify(errorText(e), true);
        }
    }
    async function remove() {
        if (!deleting)
            return;
        const used = p.rounds.some((r) => r.rooms.some((room) => kind === "teams"
            ? room.teamIds.includes(deleting.id)
            : kind === "judges"
                ? room.judges.some((j) => j.id === deleting.id)
                : room.venueId === deleting.id));
        try {
            await update({
                ...p,
                [kind]: used
                    ? list.map((t) => t.id === deleting.id
                        ? {
                            ...t,
                            active: false,
                        }
                        : t)
                    : list.filter((t) => t.id !== deleting.id),
                ...(kind === "teams" && !used
                    ? {
                        judges: p.judges.map((j) => ({
                            ...j,
                            conflictTeams: j.conflictTeams.filter((id) => id !== deleting.id),
                        })),
                    }
                    : {}),
            });
            setDeleting(null);
            notify(used ? tr("已有比赛记录，已停用并保留历史") : tr("已删除"));
        }
        catch (e) {
            notify(errorText(e), true);
        }
    }
    async function importFile(f: File) {
        setBusy(true);
        try {
            const records = await readRecords(f), items = isTeams
                ? parseTeams(records)
                : isJudges
                    ? parseJudges(records)
                    : records.map((row) => ({
                        id: uid(),
                        name: value(row, [
                            "name",
                            "venue",
                            tr("场地"),
                            tr("名称"),
                            tr("场地名称"),
                        ]),
                        active: !["no", "false", "0", tr("否")].includes(value(row, ["active", tr("启用")], "yes").toLowerCase()),
                    }));
            if (items.some((t) => !t.name) ||
                new Set(items.map((t) => t.name)).size !== items.length)
                throw new Error(tr("名称缺失或重复"));
            if (items.some((t) => list.some((old) => old.name.toLowerCase() === t.name.toLowerCase())))
                throw new Error(tr("导入包含已存在的名称，请先处理重复队伍或裁判"));
            await update({
                ...p,
                [kind]: [...list, ...items],
            });
            notify(tr("已导入 {0} {1}", [items.length, unit]));
        }
        catch (e) {
            notify(errorText(e), true);
        }
        finally {
            setBusy(false);
            if (file.current)
                file.current.value = "";
        }
    }
    async function autoVenues() {
        const needed = Math.ceil(p.teams.filter((t) => t.active).length / 4);
        if (!needed) {
            notify(tr("请先添加参赛队伍"), true);
            return;
        }
        const active = p.venues.filter((v) => v.active).length;
        const additions: Venue[] = [];
        for (let i = 1; additions.length < needed - active; i++) {
            const name = `Room ${i}`;
            if (!p.venues.some((v) => v.name === name))
                additions.push({
                    id: uid(),
                    name,
                    active: true,
                });
        }
        await update({
            ...p,
            venues: [...p.venues, ...additions],
        });
        notify(additions.length
            ? tr("已新增 {0} 个场地", [additions.length])
            : tr("现有场地已足够"));
    }
    return (<>
      <PageTitle eyebrow={isTeams ? "PARTICIPANTS" : isJudges ? "ADJUDICATORS" : "VENUES"} title={title} description={isTeams
            ? tr("每支队伍，每一种声音，都在这里就位。")
            : isJudges
                ? tr("安排合适的评判，让每场交锋公平发生。")
                : tr("为下一场精彩辩论，准备一个好位置。")} actions={<>
            {<>
                <Button variant="outline" disabled={busy} onClick={() => file.current?.click()}>
                  <Upload size={16}/>
                  {busy ? tr("导入中…") : tr("导入 Excel / CSV")}
                </Button>
                <input ref={file} className="hidden" type="file" accept=".xlsx,.xlsm,.csv" aria-label={tr("导入文件")} onChange={(e) => {
                    if (e.target.files?.[0])
                        void importFile(e.target.files[0]);
                }}/>
              </>}
            {kind === "venues" && (<Button variant="outline" onClick={() => void autoVenues()}>
                <MapPin size={16}/>
                {tr("自动生成场地")}
              </Button>)}
            <Button onClick={() => setEditing(blank())}>
              <Plus size={16}/>
              {tr("添加")}
              {isTeams ? tr("队伍") : isJudges ? tr("裁判") : tr("场地")}
            </Button>
          </>}/>
      <div className="metric-strip">
        <div className="metric-main">
          {isTeams ? (<Users size={20}/>) : isJudges ? (<Scale size={20}/>) : (<MapPin size={20}/>)}
          <strong>{list.length}</strong>
          <span>{unit}</span>
        </div>
        <span className="strip-divider"/>
        <span>
          <i className="dot green"/>
          {list.filter((t) => t.active).length}
          {tr("已启用")}
        </span>
        <span>
          <i className="dot"/>
          {list.filter((t) => !t.active).length}
          {tr("已停用")}
        </span>
        {isTeams && (<span className="ml-auto subtle">
            {list.filter((t) => t.active).length * 2}
            {tr("位辩手 · 每场 4 支队伍")}
          </span>)}
      </div>
      <section className="panel">
        <div className="table-toolbar">
          <div className="segmented">
            {[
            ["all", tr("全部")],
            ["active", tr("已启用")],
            ["inactive", tr("已停用")],
        ].map(([v, t]) => (<button className={filter === v ? "selected" : ""} onClick={() => {
                setFilter(v);
                setPage(1);
            }} key={v}>
                {t}
              </button>))}
          </div>
          <SearchBox value={query} onChange={(v) => {
            setQuery(v);
            setPage(1);
        }} placeholder={tr("搜索{0}…", [
            isTeams
                ? tr("队名、学校或辩手")
                : isJudges
                    ? tr("裁判姓名或学校")
                    : tr("场地名称"),
        ])}/>
        </div>
        {!filtered.length ? (<Empty title={list.length
                ? tr("没有匹配的结果")
                : tr("还没有{0}", [
                    isTeams
                        ? tr("参赛队伍")
                        : isJudges
                            ? tr("裁判")
                            : tr("场地"),
                ])} description={list.length
                ? tr("试试其他搜索词或筛选条件。")
                : isTeams
                    ? tr("添加队伍或导入报名表，开始筹备你的赛事。")
                    : isJudges
                        ? tr("支持录入工作轮次、裁判等级与回避关系。")
                        : tr("手动添加，或根据队伍数量自动生成场地。")} action={<Button variant="outline" onClick={() => setEditing(blank())}>
                <Plus size={15}/>
                {tr("立即添加")}
              </Button>}/>) : (<TableFrame>
            <table className={`people-table ${kind}-table`}>
              <thead>
                <tr>
                  <th className="num-col">{tr("序号")}</th>
                  <th>
                    {isTeams
                ? tr("队伍名称")
                : isJudges
                    ? tr("裁判姓名")
                    : tr("场地名称")}
                  </th>
                  {kind !== "venues" && <th>{tr("学校 / 单位")}</th>}
                  {isTeams && (<>
                      <th>{tr("辩手 1")}</th>
                      <th>{tr("辩手 2")}</th>
                      <th>{tr("类别")}</th>
                    </>)}
                  {isJudges && (<>
                      <th>{tr("等级")}</th>
                      <th>{tr("工作轮次")}</th>
                      <th>{tr("回避关系")}</th>
                    </>)}
                  <th>{tr("状态")}</th>
                  <th className="text-right">{tr("操作")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered
                .slice((current - 1) * 12, current * 12)
                .map((t, i) => (<tr key={t.id}>
                      <td className="tabular-nums subtle">
                        {String((current - 1) * 12 + i + 1).padStart(2, "0")}
                      </td>
                      <td>
                        <div className="entity-name">
                          <span className={`initial-avatar ${isJudges ? "blue" : ""}`}>
                            {t.name.slice(0, 1)}
                          </span>
                          <strong>{t.name}</strong>
                        </div>
                      </td>
                      {"institution" in t && <td>{t.institution || "—"}</td>}
                      {"speaker1" in t && (<>
                          <td>{t.speaker1 || "—"}</td>
                          <td>{t.speaker2 || "—"}</td>
                          <td>
                            {t.secondLanguage ? (<Badge tone="blue">{tr("二语")}</Badge>) : (<span className="subtle">{tr("公开组")}</span>)}
                          </td>
                        </>)}
                      {"rating" in t && (<>
                          <td>
                            <span className="rating-stars">{t.rating}</span>
                            <span className="subtle"> / 9</span>
                          </td>
                          <td>
                            <span className="task-text">
                              {t.workTask || tr("不限轮次")}
                            </span>
                            {t.workTime && (<small className="block subtle">
                                {t.workTime}
                              </small>)}
                          </td>
                          <td>
                            {t.conflictInstitutions.length +
                        t.conflictTeams.length
                        ? tr("{0} 项回避", [
                            t.conflictInstitutions.length +
                                t.conflictTeams.length,
                        ])
                        : "—"}
                          </td>
                        </>)}
                      <td>
                        <Badge tone={t.active ? "green" : "gray"}>
                          {t.active ? (<>
                              <i className="dot green"/>
                              {tr("已启用")}
                            </>) : (tr("已停用"))}
                        </Badge>
                      </td>
                      <td>
                        <div className="row-actions">
                          <Button variant="ghost" size="icon" aria-label={tr("编辑 {0}", [t.name])} onClick={() => setEditing(t)}>
                            <Pencil size={15}/>
                          </Button>
                          <Button variant="ghost" size="icon" aria-label={tr("删除 {0}", [t.name])} onClick={() => setDeleting(t)}>
                            <Trash2 size={15}/>
                          </Button>
                        </div>
                      </td>
                    </tr>))}
              </tbody>
            </table>
          </TableFrame>)}
        <div className="table-footer">
          <span>
            {tr("共")}
            {filtered.length} {unit}
          </span>
          <div>
            <Button variant="ghost" size="sm" disabled={current <= 1} onClick={() => setPage(current - 1)}>
              {tr("上一页")}
            </Button>
            <span>
              {current} / {pages}
            </span>
            <Button variant="ghost" size="sm" disabled={current >= pages} onClick={() => setPage(current + 1)}>
              {tr("下一页")}
            </Button>
          </div>
        </div>
      </section>
      {isTeams && (<><Button variant="ghost" size="sm" onClick={() => exportCSV([
                [
                    tr("学校"),
                    tr("队名"),
                    tr("辩手1"),
                    tr("辩手2"),
                    tr("二语"),
                ],
                [tr("示例大学"), tr("示例队伍"), tr("张三"), tr("李四"), ""],
            ], tr("队伍导入模板.csv"))}>
            <Download size={14}/>
            {tr("下载模板")}
          </Button></>)}
      <Modal title={`${list.some((t) => t.id === editing?.id) ? tr("编辑") : tr("添加")}${isTeams ? tr("队伍") : isJudges ? tr("裁判") : tr("场地")}`} description={isJudges
            ? tr("工作任务留空表示不限轮次。裁判自身学校也会自动计入同校冲突。")
            : undefined} open={!!editing} onClose={() => setEditing(null)}>
        {editing && (<form className="entity-form" onSubmit={(e) => void save(e)}>
            <label>
              {isTeams
                ? tr("队伍名称")
                : isJudges
                    ? tr("裁判姓名")
                    : tr("场地名称")}
              <input name="name" autoFocus required maxLength={150} defaultValue={editing.name}/>
            </label>
            {"institution" in editing && (<label>
                {tr("学校 / 单位")}
                <input name="institution" defaultValue={editing.institution}/>
              </label>)}
            {"speaker1" in editing && (<>
                <div className="form-grid">
                  <label>
                    {tr("辩手 1")}
                    <input name="speaker1" defaultValue={editing.speaker1}/>
                  </label>
                  <label>
                    {tr("辩手 2")}
                    <input name="speaker2" defaultValue={editing.speaker2}/>
                  </label>
                </div>
                <label className="check-label">
                  <input type="checkbox" name="secondLanguage" defaultChecked={editing.secondLanguage}/>
                  {tr("第二语言队伍")}
                </label>
              </>)}
            {"rating" in editing && (<>
                <div className="form-grid">
                  <label>
                    {tr("裁判等级")}
                    <input type="number" name="rating" min="1" max="9" required defaultValue={editing.rating}/>
                  </label>
                  <label>
                    {tr("工作轮次")}
                    <input name="workTask" defaultValue={editing.workTask} placeholder={tr("Round 1-3、5 或 替补")}/>
                  </label>
                </div>
                <label>
                  {tr("工作时间（记录）")}
                  <input name="workTime" defaultValue={editing.workTime} placeholder={tr("如 5月23日上午")}/>
                </label>
                <label>
                  {tr("回避学校（逗号分隔）")}
                  <input name="conflictInstitutions" defaultValue={editing.conflictInstitutions.join("，")}/>
                </label>
                <label>
                  {tr("回避队伍")}
                  <select multiple name="conflictTeams" defaultValue={editing.conflictTeams} size={Math.min(4, p.teams.length || 2)}>
                    {p.teams.map((t) => (<option key={t.id} value={t.id}>
                        {t.name}
                      </option>))}
                  </select>
                  <small>{tr("按住 Ctrl / Command 多选或取消选择")}</small>
                </label>
              </>)}
            <label className="check-label">
              <input type="checkbox" name="active" defaultChecked={editing.active}/>
              {tr("启用，参与后续编排")}
            </label>
            <div className="modal-actions">
              <Button variant="outline" type="button" onClick={() => setEditing(null)}>
                {tr("取消")}
              </Button>
              <Button type="submit">
                {tr("保存")}
                {isTeams ? tr("队伍") : isJudges ? tr("裁判") : tr("场地")}
              </Button>
            </div>
          </form>)}
      </Modal>
      <Modal title={tr("删除这条记录？")} open={!!deleting} onClose={() => setDeleting(null)} description={tr("未使用的记录将删除；已有比赛历史的记录将停用，历史对阵与成绩会保留。")}>
        <p className="my-6 font-medium">{deleting?.name}</p>
        <div className="modal-actions">
          <Button variant="outline" onClick={() => setDeleting(null)}>
            {tr("取消")}
          </Button>
          <Button variant="destructive" onClick={() => void remove()}>
            {tr("确认删除 / 停用")}
          </Button>
        </div>
      </Modal>
    </>);
}
