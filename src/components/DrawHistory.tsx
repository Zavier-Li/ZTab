import { useState } from 'react';
import { History, Pencil, RotateCcw } from 'lucide-react';
import { Button } from './ui/button';
import { Modal } from './ui/dialog';
import { Badge } from './shared';
import type { PageProps } from './shared';
import { hasAnyScores, POSITIONS, renameDrawSnapshot, restoreDrawSnapshot, type DrawSnapshot } from '@/lib/types';
import { t as tr } from '@/lib/i18n';

export function DrawHistory({ p, update, notify, snapshots }: Pick<PageProps, 'p' | 'update' | 'notify'> & { snapshots: DrawSnapshot[] }) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const latestFirst = [...snapshots].reverse();
  const selected = latestFirst.find(snapshot => snapshot.id === selectedId) ?? latestFirst[0];
  const locked = hasAnyScores(p);

  async function saveName(id: string) {
    try {
      await update(renameDrawSnapshot(p, id, name));
      setRenamingId(null);
      notify(tr('历史版本名称已更新'));
    } catch (error) {
      notify(tr(error instanceof Error ? error.message : '保存失败'), true);
    }
  }

  async function restore(id: string) {
    setBusy(true);
    try {
      await update(restoreDrawSnapshot(p, id));
      setOpen(false);
      notify(tr('历史对阵已恢复'));
    } catch (error) {
      notify(tr(error instanceof Error ? error.message : '恢复失败'), true);
    } finally {
      setBusy(false);
    }
  }

  const actionLabel = (snapshot: DrawSnapshot) => snapshot.action === 'baseline' ? '初始版本' : snapshot.action === 'generated' ? '重新生成' : snapshot.action === 'restored' ? '恢复版本' : '编辑保存';
  const titleFor = (snapshot: DrawSnapshot) => snapshot.name || `${tr(actionLabel(snapshot))} · ${new Date(snapshot.savedAt).toLocaleString()}`;

  return <>
    <Button variant="outline" onClick={() => { setSelectedId(null); setOpen(true); }}>
      <History size={16}/>
      {tr('对阵历史')} {snapshots.length ? `· ${snapshots.length}` : ''}
    </Button>
    <Modal title={tr('对阵历史')} description={tr('每次生成或保存对阵调整后，自动记录完整赛程快照。')} open={open} onClose={() => setOpen(false)} wide>
      {!latestFirst.length ? <div className="draw-history-empty">{tr('还没有对阵历史')}</div> : <div className="draw-history-layout">
        <div className="draw-history-list" aria-label={tr('历史版本')}>
          {latestFirst.map(snapshot => <div key={snapshot.id} className={`draw-history-item ${snapshot.id === selected?.id ? 'selected' : ''}`}>
            {renamingId === snapshot.id ? <form className="draw-history-rename" onSubmit={event => { event.preventDefault(); void saveName(snapshot.id); }}>
              <input aria-label={tr('快照名称')} autoFocus maxLength={80} value={name} onChange={event => setName(event.target.value)} />
              <Button size="sm" type="submit" disabled={!name.trim()}>{tr('保存')}</Button>
              <Button size="sm" variant="ghost" type="button" onClick={() => setRenamingId(null)}>{tr('取消')}</Button>
            </form> : <>
              <button type="button" className="draw-history-select" onClick={() => setSelectedId(snapshot.id)}>
                <strong>{titleFor(snapshot)}</strong>
                <span>{snapshot.name ? `${tr(actionLabel(snapshot))} · ` : ''}{snapshot.rounds.length} {tr('轮')}</span>
              </button>
              <Button variant="ghost" size="icon" aria-label={tr('重命名')} title={tr('重命名')} onClick={() => { setName(snapshot.name ?? ''); setRenamingId(snapshot.id); }}><Pencil size={16}/></Button>
            </>}
          </div>)}
        </div>
        {selected && <section className="draw-history-detail" aria-label={tr('快照详情')}>
          <header>
            <div><strong>{titleFor(selected)}</strong><small>{new Date(selected.savedAt).toLocaleString()} · {tr(actionLabel(selected))}</small></div>
          </header>
          {selected.rounds.map(round => <article className="draw-history-round" key={round.id}>
            <h3>{tr('第 {0} 轮', [round.no])}{round.timeSlot ? <small>{round.timeSlot}</small> : null}</h3>
            {round.rooms.map((room, roomIndex) => {
              const venue = selected.venues.find(item => item.id === room.venueId)?.name ?? '—';
              return <div className="draw-history-room" key={room.id}>
                <strong>{venue}</strong>
                <div className="draw-history-positions">{room.teamIds.map((teamId, index) => {
                  const team = selected.teams.find(item => item.id === teamId);
                  return <div key={`${teamId}-${index}`}><Badge>{POSITIONS[index]}</Badge><strong>{team?.name ?? teamId}</strong><small>{[team?.speaker1, team?.speaker2].filter(Boolean).join(' / ')}</small></div>;
                })}</div>
                <small>{tr('裁判')}：{room.judges.map(judge => `${tr(judge.role === 'Chair' ? '主裁' : judge.role === 'Panel' ? '副裁' : '计时')} ${selected.judges.find(item => item.id === judge.id)?.name ?? '—'}`).join(' · ') || '—'}</small>
              </div>;
            })}
          </article>)}
          <footer className="draw-history-restore">
            {locked && <span>{tr('有成绩或裁判评分时不能恢复对阵历史')}</span>}
            <Button disabled={locked || busy} onClick={() => void restore(selected.id)}><RotateCcw size={16}/>{tr('恢复此版本')}</Button>
          </footer>
        </section>}
      </div>}
    </Modal>
  </>;
}
