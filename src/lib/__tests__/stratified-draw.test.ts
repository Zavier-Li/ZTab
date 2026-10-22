import {describe,it,expect} from 'vitest';
import {generateRandomDraw,defaultDrawOptions} from '../random-draw';
describe('通用分层预排',()=>{
 it.each([4,8,12,16,20,24])('%s队四轮各辩位一次，对手覆盖如实报告',n=>{
  const g=generateRandomDraw(42,Array.from({length:n},(_,i)=>`T${i}`),'random-new',undefined,defaultDrawOptions,[]);
  expect(g.draws.every(r=>r.length===n/4&&new Set(r.flat()).size===n)).toBe(true);
  expect(g.report.teams.every(t=>new Set(t.roles).size===4)).toBe(true);
  expect(g.report.distinct_pairs).toBeLessThanOrEqual(n*(n-1)/2);
 },30000);
 it.each([1,3,4,5,7,11])('12队标记%s支强队，逐轮强队数均衡',k=>{
  const flags=Array.from({length:12},(_,i)=>i<k);
  const g=generateRandomDraw(42,flags.map((_,i)=>`T${i}`),'random-new',undefined,defaultDrawOptions,[],flags);
  for(const rr of g.draws){const counts=rr.map(room=>room.filter(t=>flags[t]).length);expect(Math.max(...counts)-Math.min(...counts)).toBeLessThanOrEqual(1);}
  expect(g.report.strength?.marked).toBe(k);
 },30000);
 it('不支持不足四队或非四倍数',()=>{
  for(const n of [1,3,6,10])expect(()=>generateRandomDraw(1,Array.from({length:n},(_,i)=>String(i)),'random-new')).toThrow();
 });
});
