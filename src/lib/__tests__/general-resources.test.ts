import {describe,it,expect} from 'vitest';
import {demoProject} from '../db';
import {generateRandomDraw,defaultDrawOptions} from '../random-draw';
import {optimizeDrawResources} from '../draw-resources';
import {validateProject,importBackup} from '../import';
import {uid} from '../types';
import JSZip from 'jszip';
describe('通用预排资源与备份',()=>{
 it('20队使用七个实际场地，资源搜索不改变队伍及辩位',()=>{
  const p=demoProject();p.teams=Array.from({length:20},(_,i)=>({...p.teams[i%12],id:uid(),name:`Team${i}`,isStrong:i<7}));p.venues=Array.from({length:7},(_,i)=>({id:uid(),name:`V${i}`,active:true}));
  const g=generateRandomDraw(7,p.teams.map(t=>t.name),'random-new',undefined,defaultDrawOptions,[],p.teams.map(t=>!!t.isStrong));
  const rounds=g.draws.map((rooms,r)=>({id:uid(),no:r+1,createdAt:'',rooms:rooms.map((ids,v)=>({id:uid(),venueId:p.venues[v].id,teamIds:ids.map(i=>p.teams[i].id),judges:[],results:[]}))}));
  const before=rounds.map(r=>r.rooms.map(room=>room.teamIds.join()).sort());const result=optimizeDrawResources(p,rounds,7);
  expect(result.method).toBe('room-swap-search');expect(rounds.map(r=>r.rooms.map(room=>room.teamIds.join()).sort())).toEqual(before);
  expect(new Set(rounds.flatMap(r=>r.rooms.map(room=>room.venueId))).size).toBe(7);
  p.rounds=rounds;p.randomMeta={seed:7,mode:'random-new',original:g.draws,baseline:null,changed:0,teamOrder:p.teams.map(t=>t.id),strongTeamIds:p.teams.filter(t=>t.isStrong).map(t=>t.id),options:defaultDrawOptions,resources:result};
  expect(validateProject(p)).toBe(p);
 },30000);
 it('通用排程JSON导入保留强队及逐轮场地映射',async()=>{
  const names=Array.from({length:16},(_,i)=>`T${i}`);const g=generateRandomDraw(42,names,'random-new');
  const raw={teams:names.map((name,i)=>({name,isStrong:i<3})),draws:g.draws,venues:['A','B','C','D','E'],round_venues:Array.from({length:4},()=>['B','C','D','E']),options:defaultDrawOptions};
  const imported=await importBackup({name:'schedule.json',text:async()=>JSON.stringify(raw)} as File);
  expect(imported.teams.filter(t=>t.isStrong)).toHaveLength(3);expect(imported.rounds[0].rooms[0].venueId).toBe(imported.venues[1].id);
  expect(validateProject(imported)).toBe(imported);
 });
 it('可直接导入包含排程JSON的赛程ZIP',async()=>{
  const names=Array.from({length:12},(_,i)=>`Team${i}`);const g=generateRandomDraw(2929491163,names,'random-new');
  const raw={teams:names.map((name,i)=>({name,speaker1:`S${i}`,speaker2:`D${i}`,isStrong:i<4})),draws:g.draws,venues:['C107','C110','C128'],round_venues:Array.from({length:4},()=>['C107','C110','C128']),options:defaultDrawOptions};
  const zip=new JSZip();zip.file('正式赛程/排程与校验.json',JSON.stringify(raw));
  const data=await zip.generateAsync({type:'arraybuffer'});
  const imported=await importBackup({name:'正式赛程.zip',arrayBuffer:async()=>data} as File);
  expect(imported.teams).toHaveLength(12);expect(imported.teams.filter(t=>t.isStrong)).toHaveLength(4);
  expect(imported.rounds).toHaveLength(4);expect(imported.rounds[0].rooms[0].venueId).toBe(imported.venues[0].id);
  expect(validateProject(imported)).toBe(imported);
 });
});
