import 'fake-indexeddb/auto';
import {describe,it,expect} from 'vitest';
import {db,demoProject} from '../db';
import {persistScoreDraft,readScoreDraft} from '../score-autosave';
import {hasAnyScores,type ScoreDraft} from '../types';

describe('成绩自动保存',()=>{
 it('预先编排的后续空轮次不锁定成绩录入，BP后续轮次仍锁定',async()=>{
  const p=demoProject();
  p.rounds=Array.from({length:4},(_,round)=>({id:`planned-${round+1}`,no:round+1,createdAt:'',rooms:[{id:`planned-room-${round+1}`,venueId:p.venues[0].id,teamIds:p.teams.slice(0,4).map(t=>t.id),judges:[{id:p.judges[0].id,role:'Chair' as const}],results:[]}]}));
  await db.projects.put(p);
  const draft=readScoreDraft(p.rounds[0].rooms[0],'official');draft.quick='4132';draft.ranks=['4','1','3','2'];
  expect((await persistScoreDraft(p.id,'planned-1','planned-room-1',draft)).status).toBe('valid');
  const withPowerMatch=(await db.projects.get(p.id))!;
  withPowerMatch.rounds[1].bp={version:1,seed:42,brackets:[],pullups:[],positionCost:0,priorPullupCost:0,repeatedPairs:0,repeatPositionTeams:[]};
  await db.projects.put(withPowerMatch);
  await expect(persistScoreDraft(p.id,'planned-1','planned-room-1',draft)).rejects.toThrow('本轮成绩已锁定');
 });
 it('保存不完整输入，完整输入自动转正式成绩，不同赛场并发不丢失',async()=>{
  const p=demoProject();p.rounds=[{id:'auto-round',no:1,createdAt:'',rooms:[0,1,2].map(i=>({id:`room${i}`,venueId:p.venues[i].id,teamIds:p.teams.slice(i*4,i*4+4).map(t=>t.id),judges:[{id:p.judges[i].id,role:'Chair' as const}],results:[]}))}];
  await db.projects.put(p);
  const draft=readScoreDraft(p.rounds[0].rooms[0],'official');draft.quick='41';
  expect((await persistScoreDraft(p.id,'auto-round','room0',draft)).status).toBe('draft');
  let saved=(await db.projects.get(p.id))!;
  expect(hasAnyScores(saved)).toBe(true);expect(saved.rounds[0].rooms[0].results).toEqual([]);
  expect(readScoreDraft(saved.rounds[0].rooms[0],'official').quick).toBe('41');
  const valid:ScoreDraft={...draft,quick:'4132',ranks:['4','1','3','2']};
  const second={...valid,score1:['80','','','']};
  await Promise.all([persistScoreDraft(p.id,'auto-round','room0',valid),persistScoreDraft(p.id,'auto-round','room1',second)]);
  saved=(await db.projects.get(p.id))!;
  expect(saved.rounds[0].rooms[0].results.map(r=>r.rank)).toEqual([4,1,3,2]);expect(readScoreDraft(saved.rounds[0].rooms[0],'official').quick).toBe('4132');expect(saved.rounds[0].rooms[1].results[0].score1).toBe(80);expect(saved.rounds[0].rooms[0].drafts).toEqual([]);
  const changed={...valid,quick:'1234',ranks:['1','2','3','4']};
  expect((await persistScoreDraft(p.id,'auto-round','room0',changed)).status).toBe('pending');
  saved=(await db.projects.get(p.id))!;expect(saved.rounds[0].rooms[0].results.map(r=>r.rank)).toEqual([4,1,3,2]);
  await persistScoreDraft(p.id,'auto-round','room0',changed,true);
  saved=(await db.projects.get(p.id))!;expect(saved.rounds[0].rooms[0].results.map(r=>r.rank)).toEqual([1,2,3,4]);
  await persistScoreDraft(p.id,'auto-round','room0',{...changed,score1:['5','','','']});
  saved=(await db.projects.get(p.id))!;expect(saved.rounds[0].rooms[0].results).toEqual([]);expect(saved.rounds[0].rooms[0].drafts?.[0].score1[0]).toBe('5');
 });
});
