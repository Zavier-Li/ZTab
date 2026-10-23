import { t as tr } from "@/lib/i18n";
import { useRef, useState } from "react";
import { Upload, Download, Database, FileJson, FileSpreadsheet, HardDrive, ArrowRight, FolderPlus, ShieldCheck, CheckCircle2, } from "lucide-react";
import { PageTitle, Panel, type PageProps } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { importBackup } from "@/lib/import";
import { exportJSON, exportCSV, exportStandings, exportScheduleZIP, } from "@/lib/export";
import { db, demoProject } from "@/lib/db";
import { uid } from "@/lib/types";
import { errorText } from "@/lib/utils";
export default function Data({ p, update, notify, go, selectProject, }: {
    selectProject: (id: string) => void;
} & PageProps) {
    const file = useRef<HTMLInputElement>(null), [busy, setBusy] = useState(false), [dragging, setDragging] = useState(false);
    async function load(f: File) {
        setBusy(true);
        try {
            const project = await importBackup(f);
            await db.projects.add(project);
            selectProject(project.id);
            notify(tr("已导入为独立赛事，现有赛事保留"));
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
    async function demo() {
        const project = demoProject();
        await db.projects.add(project);
        selectProject(project.id);
        notify(tr("示例赛事已创建"));
    }
    async function scriptConfig() {
        if (p.rounds.length) {
            notify(tr("请在尚未生成对阵的赛事中载入配置"), true);
            return;
        }
        const panels = [
            [tr("朱琳菲"), tr("白浩楠、范昕瑶"), tr("李宇轩、李一鸣")],
            [tr("朱琳菲、李宇轩"), tr("刘一鸣、李一鸣"), tr("连建华、范昕瑶")],
            [tr("陈弘毅、李宇轩"), tr("刘一鸣、白浩楠"), tr("连建华、李一鸣")],
            [tr("朱琳菲、白浩楠"), tr("刘一鸣、范昕瑶"), tr("陈弘毅、连建华")],
        ];
        const names = [
            ...new Set(panels.flatMap((round) => round.flatMap((s) => s.split("、")))),
        ];
        const judges = names
            .filter((name) => !p.judges.some((j) => j.name === name))
            .map((name) => ({
            id: uid(),
            name,
            institution: "",
            rating: 7,
            active: true,
            workTask: panels
                .flatMap((round, r) => round.some((s) => s.split("、").includes(name)) ? [r + 1] : [])
                .join("、"),
            workTime: "",
            conflictInstitutions: [],
            conflictTeams: [],
        }));
        const venues = ["C107", "C110", "C128"]
            .filter((name) => !p.venues.some((v) => v.name === name))
            .map((name) => ({
            id: uid(),
            name,
            active: true,
        }));
        await update({
            ...p,
            judges: [...p.judges, ...judges],
            venues: [...p.venues, ...venues],
        });
        notify(tr("已载入脚本中的裁判可用轮次与场地；每场裁判仍可独立编辑"));
    }
    return (<>
      <PageTitle eyebrow="DATA & BACKUP" title={tr("数据中心")} description={tr("导入、迁移、备份。赛事数据始终在你手中。")}/>
      <div className="data-columns">
        <Panel title={tr("导入赛事项目")} description={tr("从旧项目继续，或还原完整备份。")}>
          <div className={`import-drop${dragging ? " import-drop-active" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const dropped = e.dataTransfer.files[0];
              if (dropped) void load(dropped);
            }}>
            <Upload size={29}/>
            <h3>{tr("选择本地赛事文件")}</h3>
            <p>{tr("将赛程 ZIP 拖到这里，或选择 JSON、ZIP、tournament.db 文件")}</p>
            <Button disabled={busy} onClick={() => file.current?.click()}>
              <FolderPlus size={16}/>
              {busy ? tr("正在校验并导入…") : tr("选择文件")}
            </Button>
            <small>{tr("导入创建独立赛事，不覆盖现有项目。")}</small>
          </div>
          <input type="file" accept=".json,.zip,.db" className="hidden" ref={file} aria-label={tr("导入赛事项目")} onChange={(e) => {
            if (e.target.files?.[0])
                void load(e.target.files[0]);
        }}/>
        </Panel>
        <Panel title={tr("备份当前赛事")} description={tr("保存队伍、裁判、回避关系、对阵和全部评分。")}>
          <div className="backup-summary">
            <div className="file-icon">
              <FileJson size={25}/>
            </div>
            <div>
              <strong>{p.name}</strong>
              <></>
            </div>
          </div>
          <></>
          <div className="export-buttons">
            <Button variant="outline" onClick={() => exportJSON(p)}>
              <Download size={16}/>
              {tr("导出完整 JSON 备份")}
            </Button>
            {p.randomMeta && (<Button variant="outline" disabled={busy} onClick={async () => {
                setBusy(true);
                try {
                    await exportScheduleZIP(p);
                }
                catch (e) {
                    notify(errorText(e), true);
                }
                finally {
                    setBusy(false);
                }
            }}>
                {tr("四轮排程 ZIP")}
              </Button>)}
          </div>
        </Panel>
      </div>
      <Panel title={tr("表格数据")} description={tr("按模块导入与导出，保留清楚的数据边界。")}>
        <div className="data-row">
          <FileSpreadsheet size={21}/>
          <div>
            <h3>{tr("参赛队伍与辩手")}</h3>
            <></>
          </div>
          <Button variant="ghost" onClick={() => go("teams")}>
            {tr("管理与导入")}
            <ArrowRight size={15}/>
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportCSV([
            [
                tr("队名"),
                tr("学校"),
                tr("辩手1"),
                tr("辩手2"),
                tr("二语"),
                tr("启用"),
            ],
            ...p.teams.map((t) => [
                t.name,
                t.institution,
                t.speaker1,
                t.speaker2,
                t.secondLanguage ? "yes" : "",
                t.active ? "yes" : "no",
            ]),
        ], tr("参赛队伍.csv"))}>
            <Download size={14}/>
            {tr("导出")}
          </Button>
        </div>
        <div className="data-row">
          <FileSpreadsheet size={21}/>
          <div>
            <h3>{tr("裁判与场地")}</h3>
            <></>
          </div>
          <Button variant="ghost" onClick={() => go("judges")}>
            {tr("裁判管理")}
            <ArrowRight size={15}/>
          </Button>
          <Button variant="ghost" onClick={() => go("venues")}>
            {tr("场地管理")}
            <ArrowRight size={15}/>
          </Button>
        </div>
        <div className="data-row">
          <Database size={21}/>
          <div>
            <h3>{tr("对阵与评分")}</h3>
            <></>
          </div>
          <Button variant="ghost" onClick={() => go("draw")}>
            {tr("对阵")}
            <ArrowRight size={15}/>
          </Button>
          <Button variant="ghost" onClick={() => go("results")}>
            {tr("评分")}
            <ArrowRight size={15}/>
          </Button>
        </div>
        <div className="data-row">
          <Download size={21}/>
          <div>
            <h3>{tr("队伍与辩手排名")}</h3>
            <></>
          </div>
          <Button variant="outline" size="sm" onClick={() => exportStandings(p)}>
            {tr("队伍 CSV")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportStandings(p, true)}>
            {tr("辩手 CSV")}
          </Button>
        </div>
      </Panel>
      <div className="data-columns">
        <Panel title={tr("快速开始")} description={tr("用示例数据熟悉流程，或载入原脚本的赛事配置。")}>
          <div className="export-buttons">
            <Button variant="outline" onClick={() => void demo()}>
              {tr("创建独立示例赛事")}
            </Button>
            <Button variant="outline" onClick={() => void scriptConfig()}>
              {tr("载入 CUDC 裁判与场地")}
            </Button>
          </div>
        </Panel>
        <Panel title={tr("本地存储")} description={tr("数据仅保存在此浏览器与当前网址下。")}>
          <div className="local-note">
            <HardDrive size={23}/>
            <p>
              {tr("清除浏览器数据会删除本地赛事，请导出备份。")}
            </p>
          </div>
          <div className="panel-foot">
            <ShieldCheck size={15}/>
            {tr("")}
          </div>
        </Panel>
      </div>
    </>);
}
