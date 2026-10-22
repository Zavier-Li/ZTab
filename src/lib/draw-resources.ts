import {PythonRandom} from './random-draw';
import {judgeConflicts} from './pairing';
import type {Project,Round} from './types';
const compare=(a:number[],b:number[])=>a.reduce((s,n,i)=>s||n-b[i],0);
function permutations(a:number[]):number[][]{return a.length?a.flatMap((v,i)=>permutations(a.filter((_,j)=>i!==j)).map(rest=>[v,...rest])):[[]];}
export function optimizeDrawResources(p:Project,rounds:Round[],seed:number){
 const roomCount=rounds[0]?.rooms.length??0;
 if(rounds.length!==4||!roomCount||rounds.some(r=>r.rooms.length!==roomCount))throw new Error('资源优化需要四轮且每轮赛场数相同');
 const planned=!!p.eventPlan&&p.eventPlan.venueIds.length>=roomCount;
 const venueIds=[...new Set(planned?p.eventPlan!.venueIds:p.venues.filter(v=>v.active).map(v=>v.id))].filter(id=>p.venues.some(v=>v.id===id&&v.active));
 if(venueIds.length<roomCount)throw new Error('启用场地数量不足');
 const fixedPanels=!!p.eventPlan&&p.eventPlan.venueIds.length>=roomCount;
 const panels=rounds.map(round=>venueIds.map(id=>{const v=p.eventPlan?.venueIds.indexOf(id)??-1;return v>=0?(p.eventPlan?.judgePanels[round.no-1]?.[v]??[]).map((id,i)=>({id,role:i===0?'Chair' as const:'Panel' as const})):[];}));
 const rng=new PythonRandom(seed),initial=rounds.map((_,r)=>Array.from({length:roomCount},(_,g)=>(g+r)%venueIds.length));
 let choices=initial.map(r=>[...r]),best=initial.map(r=>[...r]),bestScore:number[]|null=null,assignments=0;
 const conflicts=rounds.map((round,r)=>round.rooms.map(room=>venueIds.map((_,v)=>(fixedPanels?panels[r][v]:room.judges).filter(j=>j.role!=='Timer').reduce((s,j)=>{const judge=p.judges.find(a=>a.id===j.id);return s+(judge?judgeConflicts(judge,room.teamIds.map(id=>p.teams.find(t=>t.id===id)!)).length:0);},0))));
 function evaluate(){
  const venueCounts=new Map<string,number[]>(),judgeCounts=new Map<string,Map<string,number>>();let conflict=0;
  rounds.forEach((round,r)=>round.rooms.forEach((room,g)=>{const v=choices[r][g];conflict+=conflicts[r][g][v];for(const team of room.teamIds){if(!venueCounts.has(team))venueCounts.set(team,Array(venueIds.length).fill(0));venueCounts.get(team)![v]++;if(!judgeCounts.has(team))judgeCounts.set(team,new Map());for(const judge of(fixedPanels?panels[r][v]:room.judges).filter(j=>j.role!=='Timer')){const seen=judgeCounts.get(team)!;seen.set(judge.id,(seen.get(judge.id)??0)+1);}}}));
  const vs=[...venueCounts.values()].flat(),js=[...judgeCounts.values()].flatMap(c=>[...c.values()]);
  const score=[conflict,vs.reduce((s,n)=>s+Math.max(0,n-Math.ceil(4/venueIds.length)),0),Math.max(0,...js),js.reduce((s,n)=>s+n*(n-1)/2,0),vs.reduce((s,n)=>s+n*n,0)];assignments++;
  if(!bestScore||compare(score,bestScore)<0){bestScore=score;best=choices.map(r=>[...r]);}return score;
 }
 const exact=roomCount<=3&&venueIds.length===roomCount;
 if(exact){const order=rng.shuffle(permutations(Array.from({length:roomCount},(_,i)=>i)));function search(r:number){if(r===4){evaluate();return;}for(const perm of order){choices[r]=perm;search(r+1);}}search(0);}
 else {evaluate();for(let pass=0;pass<6;pass++){let changed=false;for(let r=0;r<4;r++)for(let a=0;a<roomCount;a++)for(let v=0;v<venueIds.length;v++){choices=best.map(x=>[...x]);const b=choices[r].indexOf(v),old=choices[r][a];if(b===a)continue;choices[r][a]=v;if(b>=0)choices[r][b]=old;const before=bestScore!;const after=evaluate();if(compare(after,before)<0)changed=true;}if(!changed)break;}}
 rounds.forEach((round,r)=>{round.rooms=round.rooms.map((room,g)=>({...room,venueId:venueIds[best[r][g]],judges:fixedPanels?panels[r][best[r][g]]:room.judges})).sort((a,b)=>venueIds.indexOf(a.venueId)-venueIds.indexOf(b.venueId));});
 const maxVenue=new Map<string,Map<string,number>>();for(const round of rounds)for(const room of round.rooms)for(const id of room.teamIds){if(!maxVenue.has(id))maxVenue.set(id,new Map());const seen=maxVenue.get(id)!;seen.set(room.venueId,(seen.get(room.venueId)??0)+1);}
 return {method:exact?'exhaustive-room-permutations' as const:'room-swap-search' as const,assignments,venueMax:Math.max(...[...maxVenue.values()].flatMap(c=>[...c.values()])),judgeMax:bestScore![2],conflictCount:bestScore![0],cost:bestScore!};
}
