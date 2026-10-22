import { defaultResetOptions, resetProjectData, type ResetOptions } from '@/lib/reset';
import { Modal } from '@/components/ui/dialog';
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
    const [resetOpen, setResetOpen] = useState(false);
    const [resetOptions, setResetOptions] = useState<ResetOptions>({...defaultResetOptions});
    const clearSchedule = resetOptions.schedule || resetOptions.teams || resetOptions.venues;
    const resetLabels: Record<keyof ResetOptions, string> = {scores:'成绩与评分', schedule:'赛程与对阵', teams:'队伍与辩手', judges:'裁判资料', venues:'场地资料', settings:'赛事设置与安排'};
    async function reset() {
        setBusy(true);
        try {
            await update(resetProjectData(p, resetOptions));
            setResetOpen(false);
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
            const preliminaryRounds = p.randomMeta ? 4 : Number(f.get('preliminaryRounds'));
            if (!Number.isInteger(preliminaryRounds) || preliminaryRounds < Math.max(1,...p.rounds.map(r => r.no)) || preliminaryRounds > 24) throw new Error(tr('预赛轮数不能少于已有轮次，且须为1至24的整数'));
            await update({
                ...p,
                eventPlan,
                rounds: p.rounds.map((r) => ({
                    ...r,
                    timeSlot: eventPlan?.timeSlots[r.no - 1] ?? r.timeSlot,
                })),
                name: String(f.get("name")).trim(),
                settings: {
                    preliminaryRounds,
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
      <PageTitle eyebrow="TOURNAMENT SETTINGS" title={tr("赛事设置")} description={tr("为这场赛事，设定合适的规则。")} actions={<Button variant="outline" className="reset-event-button" disabled={busy} onClick={() => { setResetOptions({...defaultResetOptions}); setResetOpen(true); }}>{tr("重置赛事")}</Button>}/>
      <Panel title={tr("基本信息与裁判安排")} description={tr("新设置在下一次生成或分配时生效。")}>
        <form className="settings-form entity-form" key={`${p.id}-${resetRevision}`} onSubmit={(e) => void save(e)}>
          <label>
            {tr("赛事名称")}
            <input name="name" required defaultValue={p.name} maxLength={150}/>
          </label>
          <label>{tr('预赛轮数')}<input type="number" name="preliminaryRounds" min={Math.max(1,...p.rounds.map(r => r.no))} max="24" required defaultValue={p.randomMeta ? 4 : p.settings.preliminaryRounds ?? 4} disabled={!!p.randomMeta}/></label>
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
      <Modal title={tr('重置赛事')} description={tr('选择需要清空的项目。此操作无法撤销，请先备份。')} open={resetOpen} onClose={() => { if (!busy) setResetOpen(false); }}>
        <div className="entity-form reset-options">
          {(Object.keys(resetLabels) as (keyof ResetOptions)[]).map(key => <label className="check-label" key={key}>
            <input type="checkbox" checked={key === 'schedule' ? clearSchedule : key === 'scores' ? resetOptions.scores || clearSchedule : resetOptions[key]} disabled={busy || key === 'schedule' && (resetOptions.teams || resetOptions.venues) || key === 'scores' && clearSchedule} onChange={e => setResetOptions({...resetOptions, [key]:e.target.checked})}/>{tr(resetLabels[key])}
          </label>)}
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setResetOptions(Object.fromEntries(Object.keys(resetLabels).map(key => [key, true])) as unknown as ResetOptions)}>{tr('全选')}</Button>
          {(resetOptions.teams || resetOptions.venues) && <p className="subtle">{tr('清空队伍或场地会同时清空赛程和全部评分。')}</p>}
          {resetOptions.judges && !resetOptions.scores && !clearSchedule && <p className="subtle">{tr('清空裁判会删除裁判安排及个人评分，保留正式成绩。')}</p>}
          {resetOptions.venues && <p className="subtle">{tr('清空场地会同时清空赛事场次安排。')}</p>}
          <div className="modal-actions"><Button variant="outline" disabled={busy} onClick={() => setResetOpen(false)}>{tr('取消')}</Button><Button className="reset-event-button" disabled={busy || !Object.values(resetOptions).some(Boolean)} onClick={() => void reset()}>{busy ? tr('保存中…') : tr('确认重置')}</Button></div>
        </div>
      </Modal>
    </>);
}
