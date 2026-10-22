import {describe,it,expect} from 'vitest';
import cudc from '../../data/cudc.json';
import type {Project} from '../types';
import {defaultResetOptions,resetProjectData} from '../reset';
function fixture(){
 const p=structuredClone(cudc) as Project;
 const room={id:'room',venueId:p.venues[0].id,teamIds:p.teams.slice(0,4).map(t=>t.id),judges:[{id:p.judges[0].id,role:'Chair' as const}],results:p.teams.slice(0,4).map((t,i)=>({teamId:t.id,rank:i+1,score1:80,score2:81})),ballots:[] as {judgeId:string;results:[];updatedAt:string}[],drafts:[{judgeId:p.judges[0].id,ranks:['1','','',''],score1:['','','',''],score2:['','','',''],quick:'1'},{judgeId:'official',ranks:['1','','',''],score1:['','','',''],score2:['','','',''],quick:'1'}]};
 p.rounds=[{id:'r',no:1,createdAt:'',rooms:[room]}];p.randomMeta={seed:1,mode:'random-new',original:null,baseline:null,changed:0,teamOrder:p.teams.map(t=>t.id)};return p;
}
describe('选择性重置赛事',()=>{
 it('只清空评分，保留赛程、资料和配置，不修改原对象',()=>{const p=fixture(),next=resetProjectData(p,defaultResetOptions);expect(next.rounds[0].rooms[0].results).toEqual([]);expect(next.rounds[0].rooms[0].drafts).toEqual([]);expect(next.rounds[0].rooms[0].teamIds).toEqual(p.rounds[0].rooms[0].teamIds);expect(next.teams).toEqual(p.teams);expect(next.eventPlan).toEqual(p.eventPlan);expect(p.rounds[0].rooms[0].results).toHaveLength(4)});
 it('重置赛程移除关联评分和随机元数据，保留名单',()=>{const p=fixture(),next=resetProjectData(p,{...defaultResetOptions,scores:false,schedule:true});expect(next.rounds).toEqual([]);expect(next.randomMeta).toBeUndefined();expect(next.teams).toEqual(p.teams);expect(next.judges).toEqual(p.judges)});
 it('只清空裁判，不删除队伍对阵及正式成绩，清除裁判引用',()=>{const p=fixture(),next=resetProjectData(p,{...defaultResetOptions,scores:false,judges:true});expect(next.judges).toEqual([]);expect(next.rounds[0].rooms[0].results).toHaveLength(4);expect(next.rounds[0].rooms[0].judges).toEqual([]);expect(next.rounds[0].rooms[0].drafts?.map(d=>d.judgeId)).toEqual(['official']);expect(next.eventPlan?.judgePanels.flat(2)).toEqual([])});
 it('清空队伍或场地联动清空赛程，全选保留赛事身份',()=>{const p=fixture();for(const key of ['teams','venues'] as const){const next=resetProjectData(p,{...defaultResetOptions,scores:false,[key]:true});expect(next.rounds).toEqual([]);expect(next[key]).toEqual([])}const next=resetProjectData(p,{scores:true,schedule:true,teams:true,judges:true,venues:true,settings:true});expect([next.teams,next.judges,next.venues,next.rounds]).toEqual([[],[],[],[]]);expect(next.eventPlan).toBeUndefined();expect(next.id).toBe(p.id);expect(next.name).toBe(p.name)});
});
