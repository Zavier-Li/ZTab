import { newProject } from '@/lib/types';
import { EventPlanFields } from "@/components/EventPlan";
import { t as tr } from "@/lib/i18n";
import { useState, type FormEvent } from "react";
import { Save, ShieldCheck } from "lucide-react";
import { PageTitle, Panel, type PageProps } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { errorText } from "@/lib/utils";
export default function Settings({ p, update, notify }: PageProps) {
    const [busy, setBusy] = useState(false);
    const [resetRevision, setResetRevision] = useState(0);
    async function reset() {
        if (!window.confirm(tr('重置当前赛事？将清空全部队伍、裁判、场地、赛程、成绩、裁判评分和草稿，仅保留赛事名称。此操作无法撤销，请先备份。'))) return;
        setBusy(true);
        try {
            await update({...newProject(p.name), id: p.id, createdAt: p.createdAt});
            setResetRevision(v => v + 1);
            notify(tr('赛事已重置'));
        } catch (e) { notify(errorText(e), true); }
        finally { setBusy(false); }
    }
    async function save(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        try {
            let eventPlan = p.eventPlan;
            if (eventPlan) {
                const locked = p.rounds.length > 0;
                const venueIds = locked
                    ? eventPlan.venueIds
                    : eventPlan.venueIds.map((_, v) => String(f.get(`plan-venue-${v}`)));
                if (new Set(venueIds).size !== venueIds.length)
                    throw new Error(tr("场地不能重复"));
                const judgePanels = locked
                    ? eventPlan.judgePanels
                    : eventPlan.judgePanels.map((rnd, r) => rnd.map((_, v) => [
                        String(f.get(`plan-chair-${r}-${v}`)),
                        ...f.getAll(`plan-panels-${r}-${v}`).map(String),
                    ]));
                if (judgePanels.some((rnd) => new Set(rnd.flat()).size !== rnd.flat().length))
                    throw new Error(tr("同一轮裁判不能重复"));
                eventPlan = {
                    ...eventPlan,
                    venueIds,
                    judgePanels,
                    timeSlots: eventPlan.timeSlots.map((_, r) => String(f.get(`plan-time-${r}`)).trim()),
                    tabOperator: String(f.get("tabOperator")).trim(),
                };
            }
            await update({
                ...p,
                eventPlan,
                rounds: p.rounds.map((r) => ({
                    ...r,
                    timeSlot: eventPlan?.timeSlots[r.no - 1] ?? r.timeSlot,
                })),
                name: String(f.get("name")).trim(),
                settings: {
                    panelsPerRoom: Number(f.get("panels")),
                    assignTimer: f.has("timer"),
                },
            });
            notify(tr("赛事设置已保存"));
        }
        catch (e) {
            notify(errorText(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    return (<>
      <PageTitle eyebrow="TOURNAMENT SETTINGS" title={tr("赛事设置")} description={tr("为这场赛事，设定合适的规则。")} actions={<Button variant="outline" className="reset-event-button" disabled={busy} onClick={() => void reset()}>{tr("重置赛事")}</Button>}/>
      <Panel title={tr("基本信息与裁判安排")} description={tr("新设置在下一次生成或分配时生效。")}>
        <form className="settings-form entity-form" key={`${p.id}-${resetRevision}`} onSubmit={(e) => void save(e)}>
          <label>
            {tr("赛事名称")}
            <input name="name" required defaultValue={p.name} maxLength={150}/>
          </label>
          <label>
            {tr("每个赛场的副裁数量")}
            <input type="number" name="panels" min="0" max="10" required defaultValue={p.settings.panelsPerRoom}/>
            <small>{tr("每场默认分配 1 位主裁，再按此数量分配副裁。")}</small>
          </label>
          <label className="check-label">
            <input type="checkbox" name="timer" defaultChecked={p.settings.assignTimer}/>
            {tr("每个赛场自动分配 1 位计时员")}
          </label>
          <></>
          <EventPlanFields p={p}/>
          <Button type="submit" disabled={busy}>
            <Save size={16}/>
            {busy ? tr("保存中…") : tr("保存设置")}
          </Button>
        </form>
      </Panel>
    </>);
}
