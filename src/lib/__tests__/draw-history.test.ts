import { describe, expect, it } from 'vitest';
import cudc from '../../data/cudc.json';
import { appendDrawSnapshot, renameDrawSnapshot, restoreDrawSnapshot, swapRoomJudgePanels, type Project } from '../types';

describe('对阵版本快照', () => {
  it('保存带时间戳的完整对阵副本，后续修改不改变已存版本', () => {
    const project = structuredClone(cudc) as Project;
    const teamIds = project.teams.slice(0, 4).map(team => team.id);
    project.rounds = [{
      id: 'round-1', no: 1, createdAt: '2026-10-22T01:00:00.000Z', timeSlot: '08:30–10:30',
      rooms: [{ id: 'room-1', venueId: project.venues[0].id, teamIds, judges: [{ id: project.judges[0].id, role: 'Chair' }], results: teamIds.map((teamId, rank) => ({ teamId, rank: rank + 1, score1: 80, score2: 81 })) }],
    }];

    const saved = appendDrawSnapshot(project, 'edited');
    expect(saved.drawHistory).toHaveLength(1);
    const snapshot = saved.drawHistory![0];
    expect(snapshot.action).toBe('edited');
    expect(Number.isNaN(Date.parse(snapshot.savedAt))).toBe(false);
    expect(snapshot.rounds[0].rooms[0]).toMatchObject({ venueId: project.venues[0].id, teamIds, judges: project.rounds[0].rooms[0].judges });
    expect(snapshot.rounds[0].rooms[0]).not.toHaveProperty('results');

    saved.rounds[0].rooms[0].teamIds.reverse();
    const nextVersion = appendDrawSnapshot(saved, 'edited');
    expect(nextVersion.drawHistory).toHaveLength(2);
    expect(nextVersion.drawHistory![0].rounds[0].rooms[0].teamIds).toEqual(teamIds);
  });

  it('重命名只更新指定快照并保存在项目数据中', () => {
    const project = structuredClone(cudc) as Project;
    const saved = appendDrawSnapshot(project, 'generated');
    const id = saved.drawHistory![0].id;
    const renamed = renameDrawSnapshot(saved, id, '决赛前最终版');
    expect(renamed.drawHistory![0].name).toBe('决赛前最终版');
    expect(saved.drawHistory![0].name).toBeUndefined();
  });

  it('恢复历史编排并生成恢复版本快照，且不恢复成绩', () => {
    const project = structuredClone(cudc) as Project;
    const teamIds = project.teams.slice(0, 4).map(team => team.id);
    project.rounds = [{
      id: 'round-1', no: 1, createdAt: '2026-10-22T01:00:00.000Z', timeSlot: '08:30–10:30',
      rooms: [{ id: 'room-1', venueId: project.venues[0].id, teamIds, judges: [{ id: project.judges[0].id, role: 'Chair' }], results: [] }],
    }];
    const saved = appendDrawSnapshot(project, 'generated');
    const snapshotId = saved.drawHistory![0].id;
    saved.rounds[0].rooms[0].teamIds.reverse();
    saved.rounds[0].timeSlot = '10:30–12:30';

    const restored = restoreDrawSnapshot(saved, snapshotId);
    expect(restored.rounds[0].rooms[0].teamIds).toEqual(teamIds);
    expect(restored.rounds[0].timeSlot).toBe('08:30–10:30');
    expect(restored.rounds[0].rooms[0].results).toEqual([]);
    expect(restored.drawHistory).toHaveLength(2);
    expect(restored.drawHistory![1].action).toBe('restored');
  });

  it('有任何成绩时拒绝恢复，避免成绩错配', () => {
    const project = structuredClone(cudc) as Project;
    const teamIds = project.teams.slice(0, 4).map(team => team.id);
    project.rounds = [{
      id: 'round-1', no: 1, createdAt: new Date().toISOString(),
      rooms: [{ id: 'room-1', venueId: project.venues[0].id, teamIds, judges: [], results: [{ teamId: teamIds[0], rank: 1, score1: 80, score2: 80 }] }],
    }];
    const saved = appendDrawSnapshot(project, 'generated');
    expect(() => restoreDrawSnapshot(saved, saved.drawHistory![0].id)).toThrow(/成绩/);
  });

  it('交换两个赛场的完整裁判组并保留原项目不变', () => {
    const project = structuredClone(cudc) as Project;
    const [chairA, chairB] = project.judges;
    project.rounds = [{
      id: 'round-1', no: 1, createdAt: new Date().toISOString(),
      rooms: [
        { id: 'room-a', venueId: project.venues[0].id, teamIds: [], judges: [{ id: chairA.id, role: 'Chair' }], results: [] },
        { id: 'room-b', venueId: project.venues[1].id, teamIds: [], judges: [{ id: chairB.id, role: 'Chair' }, { id: project.judges[2].id, role: 'Panel' }], results: [] },
      ],
    }];
    const swapped = swapRoomJudgePanels(project, 'round-1', 'room-a', 'room-b');
    expect(swapped.rounds[0].rooms.map(room => room.judges)).toEqual([
      [{ id: chairB.id, role: 'Chair' }, { id: project.judges[2].id, role: 'Panel' }],
      [{ id: chairA.id, role: 'Chair' }],
    ]);
    expect(project.rounds[0].rooms[0].judges).toEqual([{ id: chairA.id, role: 'Chair' }]);
  });
});
