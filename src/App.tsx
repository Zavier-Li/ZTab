import {Download} from 'lucide-react';
import {exportJSON} from './lib/export';
import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { LayoutDashboard, Users, Scale, MapPin, GitBranch, ClipboardCheck, Trophy, Database, Settings, ChevronDown, Plus, Sun, Moon, Languages, Menu, X, CheckCircle2, AlertCircle, ArrowUpRight, PanelLeftClose, } from "lucide-react";
import { db, initialize, saveProject } from "./lib/db";
import { newProject, type Project } from "./lib/types";
import { errorText } from "./lib/utils";
import { Button } from "./components/ui/button";
import { Modal } from "./components/ui/dialog";
import Dashboard from "./pages/Dashboard";
import People from "./pages/People";
import Draw from "./pages/Draw";
import Results from "./pages/Results";
import Standings from "./pages/Standings";
import Data from "./pages/Data";
import SettingsPage from "./pages/Settings";
import { t as tr, getLanguage, setLanguage, type Language } from "./lib/i18n";
const nav = [
    {
        id: "overview",
        label: "赛事总览",
        icon: LayoutDashboard,
    },
    {
        id: "teams",
        label: "参赛队伍",
        icon: Users,
    },
    {
        id: "judges",
        label: "裁判管理",
        icon: Scale,
    },
    {
        id: "venues",
        label: "场地管理",
        icon: MapPin,
    },
    {
        id: "draw",
        label: "对阵编排",
        icon: GitBranch,
    },
    {
        id: "results",
        label: "成绩录入",
        icon: ClipboardCheck,
    },
    {
        id: "standings",
        label: "积分与排名",
        icon: Trophy,
    },
];
const pages = new Set([...nav.map((n) => n.id), "data", "settings"]);
export default function App() {
    const [selected, setSelected] = useState(localStorage.getItem("ztab-project") ?? ""), [page, setPage] = useState(pages.has(location.hash.slice(1)) ? location.hash.slice(1) : "overview"), [mobile, setMobile] = useState(false), [creating, setCreating] = useState(false), [theme, setTheme] = useState(localStorage.getItem("ztab-theme") ?? "light"), [language, setLang] = useState<Language>(getLanguage()), [toast, setToast] = useState<{
        message: string;
        error: boolean;
    } | null>(null), [fatal, setFatal] = useState("");
    const projects = useLiveQuery(() => db.projects.orderBy("updatedAt").reverse().toArray(), []);
    const p = projects?.find((p) => p.id === selected);
    useEffect(() => {
        initialize(localStorage.getItem("ztab-project"))
            .then((id) => setSelected(id))
            .catch((e) => setFatal(errorText(e)));
    }, []);
    useEffect(() => {
        if (projects?.length && !projects.some((p) => p.id === selected))
            setSelected(projects[0].id);
    }, [projects, selected]);
    useEffect(() => {
        localStorage.setItem("ztab-project", selected);
    }, [selected]);
    useEffect(() => {
        document.documentElement.dataset.theme = theme;
        document.documentElement.style.colorScheme = theme;
        localStorage.setItem("ztab-theme", theme);
    }, [theme]);
    useEffect(() => {
        document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
        document.title = tr("ZTab · 辩论赛事工作台");
    }, [language]);
    useEffect(() => {
        const h = () => setPage(pages.has(location.hash.slice(1)) ? location.hash.slice(1) : "overview");
        window.addEventListener("hashchange", h);
        return () => window.removeEventListener("hashchange", h);
    }, []);
    useEffect(() => {
        if (!toast)
            return;
        const id = setTimeout(() => setToast(null), 6000);
        return () => clearTimeout(id);
    }, [toast]);
    function go(id: string) {
        location.hash = id;
        setPage(id);
        setMobile(false);
        window.scrollTo({
            top: 0,
            behavior: "instant",
        });
    }
    function notify(message: string, error = false) {
        setToast({
            message: tr(message),
            error,
        });
    }
    async function update(next: Project) {
        await saveProject(next);
    }
    function selectProject(id: string) {
        setSelected(id);
        go("overview");
    }
    const props = p
        ? {
            p,
            update,
            notify,
            go,
        }
        : null;
    return (<div className="app-shell">
      <a className="skip-link" href="#main-content">
        {tr("跳到主要内容")}
      </a>
      {mobile && (<button className="sidebar-scrim" aria-label={tr("关闭导航")} onClick={() => setMobile(false)}/>)}
      <aside className={`sidebar ${mobile ? "is-open" : ""}`}>
        <button className="brand" onClick={() => go("overview")} aria-label="ZTab Home">
          <span className="brand-mark">
            <svg viewBox="0 0 32 32">
              <path d="M8 8h18L14 21h11v4H6l12-13H8z" fill="currentColor"/>
            </svg>
          </span>
          <strong>
            ZTab<span>.</span>
          </strong>
          <></>
        </button>
        <div className="workspace-picker">

          <div>
            <small>{tr("当前赛事")}</small>
            <select aria-label={tr("切换赛事")} value={selected} onChange={(e) => selectProject(e.target.value)}>
              {projects?.map((item) => (<option key={item.id} value={item.id}>
                  {item.name}
                </option>))}
            </select>
          </div>
          <ChevronDown size={14}/>
        </div>
        <></>
        <nav aria-label={tr("赛事导航")}>
          {nav.map(({ id, label, icon: Icon }) => (<button key={id} className={`nav-link ${page === id ? "active" : ""}`} onClick={() => go(id)}>
              <Icon size={18}/>
              <span>{tr(label)}</span>
              {id === "teams" && !!p?.teams.length && (<small>{p.teams.filter((t) => t.active).length}</small>)}
              {page === id && <i />}
            </button>))}
        </nav>
        <div className="nav-divider"/>
        <nav aria-label={tr("管理")}>
          <button className={`nav-link ${page === "data" ? "active" : ""}`} onClick={() => go("data")}>
            <Database size={18}/>
            <span>{tr("数据中心")}</span>
          </button>
          <button className={`nav-link ${page === "settings" ? "active" : ""}`} onClick={() => go("settings")}>
            <Settings size={18}/>
            <span>{tr("赛事设置")}</span>
          </button>
        </nav>
        <></>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button className="mobile-menu" aria-label={tr("打开导航")} onClick={() => setMobile(!mobile)}>
              <Menu size={20}/>
            </button>
            <></>
            <></>
            <strong>
              {tr(nav.find((n) => n.id === page)?.label ??
            (page === "data" ? tr("数据中心") : tr("赛事设置")))}
            </strong>
          </div>
          <div className="topbar-actions">{p&&page==="overview"&&<Button variant="outline" size="sm" onClick={()=>exportJSON(p)} aria-label={tr('备份赛事')}><Download size={16}/><span>{tr('备份赛事')}</span></Button>}
            <span className="save-status">
              <span className="saved-dot"/>
              {tr("已在本地保存")}
            </span>
            <div className="toolbar-divider"/>
            <Button variant="ghost" size="sm" aria-label={tr("切换中英文")} onClick={() => {
            const l = language === "zh" ? "en" : "zh";
            setLanguage(l);
            setLang(l);
        }}>
              <Languages size={16}/>
              <span>{language === "zh" ? "EN" : tr("中文")}</span>
            </Button>
            <Button variant="ghost" size="icon" aria-label={tr(theme === "light" ? tr("切换深色模式") : tr("切换浅色模式"))} onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
              {theme === "light" ? <Moon size={17}/> : <Sun size={17}/>}
            </Button>
            {page==="overview"&&<Button variant="outline" size="sm" onClick={() => setCreating(true)}>
              <Plus size={15}/>
              <span>{tr("新建赛事")}</span>
            </Button>}
          <div id="page-toolbar" className="page-toolbar"/></div>
        </header>
        <main id="main-content" className="main-content">
          {fatal ? (<div className="fatal-error">
              <AlertCircle />
              <h1>{tr("无法打开本地数据库")}</h1>
              <p>{tr(fatal)}</p>
              <Button onClick={() => location.reload()}>
                {tr("重新加载")}
              </Button>
            </div>) : !p || !props ? (<div className="loading-state">{tr("正在打开本地工作空间…")}</div>) : page === "overview" ? (<Dashboard {...props}/>) : ["teams", "judges", "venues"].includes(page) ? (<People key={`${p.id}-${page}`} {...props} kind={page as "teams" | "judges" | "venues"}/>) : page === "draw" ? (<Draw key={p.id} {...props}/>) : page === "results" ? (<Results key={p.id} {...props}/>) : page === "standings" ? (<Standings key={p.id} {...props}/>) : page === "data" ? (<Data {...props} selectProject={selectProject}/>) : (<SettingsPage {...props}/>)}
        </main>
      </div>
      <Modal title={tr("新建赛事")} description={tr("每场赛事的数据独立保存，可随时从左上角切换。")} open={creating} onClose={() => setCreating(false)}>
        <form className="entity-form" onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            try {
                const p = newProject(String(f.get("name")).trim());
                await db.projects.add(p);
                selectProject(p.id);
                setCreating(false);
                notify(tr("赛事已创建"));
            }
            catch (e) {
                notify(errorText(e), true);
            }
        }}>
          <label>
            {tr("赛事名称")}
            <input autoFocus name="name" required maxLength={150} placeholder={tr("例如：2026 春季辩论邀请赛")}/>
          </label>
          <div className="modal-actions">
            <Button type="button" variant="outline" onClick={() => setCreating(false)}>
              {tr("取消")}
            </Button>
            <Button type="submit">
              {tr("创建赛事")}
              <Plus size={15}/>
            </Button>
          </div>
        </form>
      </Modal>
      {toast && (<div role={toast.error ? "alert" : "status"} className={`toast ${toast.error ? "toast-error" : ""}`}>
          {toast.error ? <AlertCircle size={19}/> : <CheckCircle2 size={19}/>}
          <span>{toast.message}</span>
          <button aria-label={tr("关闭提示")} onClick={() => setToast(null)}>
            <X size={16}/>
          </button>
        </div>)}
    </div>);
}
