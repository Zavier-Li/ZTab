import { db } from './db';
import { hasSubsequentPowerRound, type Room, type ScoreDraft, type Result } from './types';
import { validateResults } from './standings';
import { parseQuickRanks } from './score-import';

export function readScoreDraft(room: Room, judgeId: string): ScoreDraft {
  const draft = room.drafts?.find(d => d.judgeId === judgeId);
  if (draft) {
    const saved = structuredClone(draft);
    if (!saved.quick && [...saved.ranks].sort().join() === '1,2,3,4') saved.quick = saved.ranks.join('');
    return saved;
  }
  const results = judgeId === 'official' ? room.results : room.ballots?.find(b => b.judgeId === judgeId)?.results ?? [];
  const ranks = room.teamIds.map(id => String(results.find(r => r.teamId === id)?.rank ?? ''));
  return { judgeId, quick: [...ranks].sort().join() === '1,2,3,4' ? ranks.join('') : '', ranks,
    score1: room.teamIds.map(id => String(results.find(r => r.teamId === id)?.score1 ?? '')),
    score2: room.teamIds.map(id => String(results.find(r => r.teamId === id)?.score2 ?? '')) };
}

export async function persistScoreDraft(projectId: string, roundId: string, roomId: string, draft: ScoreDraft, confirmRankChange = false) {
  return db.transaction('rw', db.projects, async () => {
    const p = await db.projects.get(projectId);
    const round = p?.rounds.find(r => r.id === roundId);
    const room = round?.rooms.find(r => r.id === roomId);
    if (!p || !round || !room) throw new Error('找不到比赛');
    if (hasSubsequentPowerRound(p, round.no)) throw new Error('本轮成绩已锁定');
    if (draft.judgeId !== 'official' && !room.judges.some(j => j.id === draft.judgeId && j.role !== 'Timer')) throw new Error('裁判不在本场评分组');
    const empty = ![draft.quick, ...draft.ranks, ...draft.score1, ...draft.score2].some(s => s.trim());
    const results: Result[] = room.teamIds.map((teamId, i) => ({ teamId, rank: Number(draft.ranks[i]),
      score1: draft.score1[i].trim() === '' ? null : Number(draft.score1[i]),
      score2: draft.score2[i].trim() === '' ? null : Number(draft.score2[i]) }));
    let error = '';
    if (!empty) {
      try { if (draft.quick) parseQuickRanks(draft.quick); validateResults(room.teamIds, results); }
      catch (e) { error = (e as Error).message; }
    }
    const previous = draft.judgeId === 'official' ? room.results : room.ballots?.find(b => b.judgeId === draft.judgeId)?.results ?? [];
    const pending = !confirmRankChange && previous.length === 4 && room.teamIds.some((id, i) => previous.find(r => r.teamId === id)?.rank !== Number(draft.ranks[i]));
    room.drafts = (room.drafts ?? []).filter(d => d.judgeId !== draft.judgeId);
    if (error || pending) room.drafts.push(structuredClone(draft));
    if (!pending && draft.judgeId === 'official') room.results = empty || error ? [] : results;
    else if (!pending && draft.judgeId !== 'official') {
      room.ballots = (room.ballots ?? []).filter(b => b.judgeId !== draft.judgeId);
      if (!empty && !error) room.ballots.push({ judgeId: draft.judgeId, results, updatedAt: new Date().toISOString() });
    }
    p.updatedAt = new Date().toISOString();
    await db.projects.put(p);
    return { status: pending ? 'pending' : empty ? 'empty' : error ? 'draft' : 'valid', error };
  });
}
