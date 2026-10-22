import {generateRandomDraw, PythonRandom, schoolCollisions, normalizeInstitution, validateSchedule, type DrawOptions, type Draws} from './random-draw';
import {optimizeDrawResources} from './draw-resources';
import {assignJudges, judgeAvailable} from './pairing';
import type {Project, Round} from './types';

// Search group relabellings together with the exact room/resource solver.
// Coverage certification is independent of this bounded secondary search.
export function generateJointRandomDraw(seed:number, names:string[], mode:'random-new', progress:((n:number)=>void)|undefined, options:DrawOptions, institutions:string[], p:Project) {
  const strong=p.teams.filter(t=>t.active).map(t=>!!t.isStrong);
  const generated = generateRandomDraw(seed,names,mode,n=>progress?.(n*0.4),options,institutions,strong);
  if (!generated.report.coverage_optimal || names.length!==12) return generated;
  const teams = p.teams.filter(t=>t.active);
  const venues = (p.eventPlan ? p.eventPlan.venueIds.map(id=>p.venues.find(v=>v.id===id)).filter(v=>!!v?.active) : p.venues.filter(v=>v.active)).slice(0,3);
  if (venues.length !== 3) return generated;
  const schoolActive = new Set(institutions.map(normalizeInstitution).filter(Boolean)).size >= options.schoolThreshold && options.schoolAvoidance !== 'off';
  const rng = new PythonRandom(seed), samples = options.searchDepth === 'deep' ? 32 : 8;
  let best = generated.draws, bestCost:number[]|null = null, candidates = 0;
  for(let attempt=0;attempt<samples;attempt++) {
    const labels=Array.from({length:12},(_,i)=>i);
    if(attempt){for(const marked of [true,false]){const ids=labels.filter(i=>strong[i]===marked),shuffled=rng.shuffle([...ids]);ids.forEach((id,j)=>labels[id]=shuffled[j]);}}
    const draws:Draws = generated.draws.map(round=>round.map(room=>room.map(id=>labels[id])));
    const schoolCost = schoolActive ? schoolCollisions(draws,institutions) : 0;
    if(options.schoolAvoidance === 'strict' && schoolCost) continue;
    const rounds:Round[] = draws.map((rooms,r)=>({id:`r${r}`,no:r+1,createdAt:'',rooms:rooms.map((ids,v)=>({id:`${r}-${v}`,venueId:venues[v]!.id,teamIds:ids.map(i=>teams[i].id),judges:[],results:[]}))}));
    for(const round of rounds) {
      if(p.eventPlan) round.rooms.forEach((room,v)=>{room.judges=(p.eventPlan!.judgePanels[round.no-1]?.[v]??[]).map((id,i)=>({id,role:i===0?'Chair':'Panel'}));});
      else if(p.judges.filter(j=>judgeAvailable(j,round.no)).length >= 3*(1+p.settings.panelsPerRoom+Number(p.settings.assignTimer))) assignJudges({...p,rounds:rounds.filter(r=>r.no<round.no)},round);
    }
    const resource = optimizeDrawResources(p,rounds,seed);
    const cost = [resource.conflictCount,schoolCost,...resource.cost.slice(1)];
    if(!bestCost || cost.reduce((cmp,n,i)=>cmp||n-bestCost![i],0)<0) {
      bestCost=cost;
      best=rounds.map(round=>round.rooms.map(room=>room.teamIds.map(id=>teams.findIndex(t=>t.id===id))));
    }
    candidates++;
    progress?.(0.4+0.6*(attempt+1)/samples);
  }
  return {...generated,draws:best,report:validateSchedule(best,names,strong),groupCandidates:candidates};
}
