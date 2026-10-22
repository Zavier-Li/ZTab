import 'fake-indexeddb/auto';
import {describe,it,expect} from 'vitest';
import {db,initialize,demoProject} from '../db';
import cudc from '../../data/cudc.json';
import {validateProject} from '../import';
import {validateDraw} from '../pairing';
import {defaultDrawOptions,generateRandomDraw,schoolCollisions} from '../random-draw';
import {hasAnyScores,type Project,type Round} from '../types';
describe('CUDC 配置与新编排参数',()=>{
it('正式配置赛前就绪，没有预生成对阵或虚构成绩',()=>{const p=validateProject(cudc);expect(p.teams).toHaveLength(12);expect(p.judges).toHaveLength(8);expect(p.venues.map(v=>v.name)).toEqual(['C107','C110','C128']);expect(p.rounds).toEqual([]);expect(p.eventPlan?.timeSlots).toEqual(['08:30–10:30','10:30–12:30','14:00–16:00','16:00–18:00'])});
it('并发初始化只插入一份 CUDC，刷新保留数据',async()=>{await db.projects.clear();const ids=await Promise.all([initialize(),initialize()]);expect(new Set(ids).size).toBe(1);expect(await db.projects.count()).toBe(1);const p=(await db.projects.get(ids[0]))!;await db.projects.put({...p,name:'持久化检查'});expect((await db.projects.get(await initialize(ids[0])))?.name).toBe('持久化检查')});
it('同校提醒仅在至少三所启用学校时出现',()=>{const p=demoProject();p.teams.forEach(t=>t.institution='A');const r:Round={id:'r',no:1,createdAt:'',rooms:Array.from({length:3},(_,i)=>({id:String(i),venueId:p.venues[i].id,teamIds:p.teams.slice(i*4,i*4+4).map(t=>t.id),judges:[{id:p.judges[i].id,role:'Chair'}],results:[]}))};expect(validateDraw(p,r).warnings.filter(w=>w.includes('存在同校'))).toHaveLength(0);p.teams[2].institution='B';expect(validateDraw(p,r).warnings.filter(w=>w.includes('存在同校'))).toHaveLength(0);p.teams[3].institution='C';expect(validateDraw(p,r).warnings.filter(w=>w.includes('存在同校')).length).toBeGreaterThan(0)});
it('严格同校回避生成的每间房没有同校队伍',()=>{const schools=Array.from({length:12},(_,i)=>String(i%4));const g=generateRandomDraw(42,Array.from({length:12},(_,i)=>String(i)),'random-new',undefined,{...defaultDrawOptions,schoolAvoidance:'strict'},schools);expect(schoolCollisions(g.draws,schools)).toBe(0)},20000);
it('严格回避无解时不静默降级',()=>{expect(()=>generateRandomDraw(42,Array.from({length:12},(_,i)=>String(i)),'random-new',undefined,{...defaultDrawOptions,schoolAvoidance:'strict'},Array.from({length:12},(_,i)=>String(i%3)))).toThrow('无解')});
it('任一正式成绩或裁判评分都锁定重排',()=>{const p=structuredClone(cudc) as Project;expect(hasAnyScores(p)).toBe(false);p.rounds=[{id:'r',no:1,createdAt:'',rooms:[{id:'room',venueId:p.venues[0].id,teamIds:[],judges:[],results:[],ballots:[{judgeId:p.judges[0].id,results:[],updatedAt:''}]}]}];expect(hasAnyScores(p)).toBe(true)});
});
