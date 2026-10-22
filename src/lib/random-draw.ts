// Python random.Random integer seeding and MT19937, for reproducible script parity.
export class PythonRandom {
  private mt = new Uint32Array(624);
  private index = 624;
  constructor(seed: number) {
    if (!Number.isSafeInteger(seed) || seed < 0)
      throw new Error("种子必须是非负安全整数");
    const keys = [seed >>> 0];
    if (seed > 0xffffffff) keys.push(Math.floor(seed / 4294967296) >>> 0);
    this.mt[0] = 19650218;
    for (let i = 1; i < 624; i++)
      this.mt[i] =
        (Math.imul(1812433253, this.mt[i - 1] ^ (this.mt[i - 1] >>> 30)) +
          i) >>>
        0;
    let i = 1,
      j = 0;
    for (let k = Math.max(624, keys.length); k; k--) {
      this.mt[i] =
        ((this.mt[i] ^
          Math.imul(this.mt[i - 1] ^ (this.mt[i - 1] >>> 30), 1664525)) +
          keys[j] +
          j) >>>
        0;
      if (++i >= 624) {
        this.mt[0] = this.mt[623];
        i = 1;
      }
      if (++j >= keys.length) j = 0;
    }
    for (let k = 623; k; k--) {
      this.mt[i] =
        ((this.mt[i] ^
          Math.imul(this.mt[i - 1] ^ (this.mt[i - 1] >>> 30), 1566083941)) -
          i) >>>
        0;
      if (++i >= 624) {
        this.mt[0] = this.mt[623];
        i = 1;
      }
    }
    this.mt[0] = 0x80000000;
  }
  uint() {
    if (this.index >= 624) {
      for (let i = 0; i < 624; i++) {
        const y =
          (this.mt[i] & 0x80000000) | (this.mt[(i + 1) % 624] & 0x7fffffff);
        this.mt[i] =
          this.mt[(i + 397) % 624] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
      }
      this.index = 0;
    }
    let y = this.mt[this.index++];
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }
  random() {
    return (
      ((this.uint() >>> 5) * 67108864 + (this.uint() >>> 6)) / 9007199254740992
    );
  }
  below(n: number) {
    const k = Math.floor(Math.log2(n)) + 1;
    let r = this.uint() >>> (32 - k);
    while (r >= n) r = this.uint() >>> (32 - k);
    return r;
  }
  shuffle<T>(a: T[]) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.below(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  sample3() {
    const pool = [0, 1, 2];
    let j = this.below(3);
    const a = pool[j];
    pool[j] = pool[2];
    j = this.below(2);
    return [a, pool[j]];
  }
}
export type Draws = number[][][];
export interface DrawOptions {schoolAvoidance:'off'|'prefer'|'strict';schoolThreshold:number;searchDepth:'standard'|'deep'}
export const defaultDrawOptions:DrawOptions={schoolAvoidance:'prefer',schoolThreshold:3,searchDepth:'standard'};
export const normalizeInstitution=(s:string)=>s.toLowerCase().replace(/[\s\p{P}]/gu,'').replace(/(教师|学生|老师|teacher|student)/gi,'');
export function schoolCollisions(draws:Draws,institutions:string[]){let count=0;for(const round of draws)for(const room of round)for(let a=0;a<4;a++)for(let b=a+1;b<4;b++)if(normalizeInstitution(institutions[room[a]]??'')&&normalizeInstitution(institutions[room[a]])===normalizeInstitution(institutions[room[b]]??''))count++;return count;}
export function validateDrawOptions(options:DrawOptions,institutions:string[],teamCount=institutions.length||12){
 if(teamCount<4||teamCount%4)throw new Error('BP 四轮预排需要至少 4 支启用队伍，且队伍数为 4 的倍数');
 if(!Number.isInteger(options.schoolThreshold)||options.schoolThreshold<3||options.schoolThreshold>Math.max(12,teamCount))throw new Error('同校回避启用学校数无效');
 if(!['off','prefer','strict'].includes(options.schoolAvoidance)||!['standard','deep'].includes(options.searchDepth))throw new Error('随机排程参数无效');
 const schools=institutions.map(normalizeInstitution).filter(Boolean);
 if(new Set(schools).size>=options.schoolThreshold&&options.schoolAvoidance==='strict'&&schools.some(s=>schools.filter(x=>x===s).length>teamCount/4))throw new Error('严格同校回避无解：同校队伍数超过每轮赛场数');
}
export interface StrengthReport {marked:number;room_balanced:boolean;strong_range:number;other_range:number;exposure_variance:number;optimal:boolean;encounters:number[]}
export interface DrawReport {
 distinct_pairs:number;repeated_pairs:number;max_pair_meetings:number;coverage_optimal:boolean;
 strength?:StrengthReport;
 teams:{name:string;roles:string[];distinct_opponents:number}[];
}
const countTeams=(draws:Draws)=>draws[0]?.flat().length??0;
export function pairCounts(draws:Draws){const n=countTeams(draws),counts=new Uint16Array(n*n);for(const rr of draws)for(const room of rr)for(let a=0;a<4;a++)for(let b=a+1;b<4;b++){const x=Math.min(room[a],room[b]),y=Math.max(room[a],room[b]);counts[x*n+y]++;}return counts;}
function strengthMetrics(draws:Draws,flags:boolean[]):StrengthReport|undefined {
 const n=countTeams(draws),marked=flags.filter(Boolean).length;if(!marked||marked===n)return undefined;
 const encounters=Array(n).fill(0);let roomBalanced=true;
 for(const rr of draws){const counts=rr.map(room=>room.filter(t=>flags[t]).length);if(Math.max(...counts)-Math.min(...counts)>1)roomBalanced=false;rr.forEach((room,v)=>room.forEach(t=>encounters[t]+=counts[v]-Number(flags[t])));}
 const groups=[encounters.filter((_,i)=>flags[i]),encounters.filter((_,i)=>!flags[i])];
 const ranges=groups.map(g=>Math.max(...g)-Math.min(...g));
 const variance=groups.reduce((s,g)=>{const mean=g.reduce((a,b)=>a+b,0)/g.length;return s+g.reduce((a,x)=>a+(x-mean)**2,0);},0);
 return {marked,room_balanced:roomBalanced,strong_range:ranges[0],other_range:ranges[1],exposure_variance:variance,optimal:roomBalanced&&ranges.every(x=>x<=1),encounters};
}
function coverageUpper(n:number){return Math.min(n*(n-1)/2,n*6);}
export function assignRoles(groups:Draws):Draws {
 const n=countTeams(groups),perRound=n/4,rooms=groups.flat().map(r=>new Set(r)),assignments=rooms.map(()=>Array<number>(4));
 for(let role=0;role<4;role++){
  const matched=new Map<number,number>();
  function augment(team:number,visited:Set<number>):boolean {for(let room=0;room<rooms.length;room++){if(!rooms[room].has(team)||visited.has(room))continue;visited.add(room);if(!matched.has(room)||augment(matched.get(room)!,visited)){matched.set(room,team);return true;}}return false;}
  for(let team=0;team<n;team++)if(!augment(team,new Set()))throw new Error('辩位二分图匹配失败');
  for(const[room,team]of matched){assignments[room][role]=team;rooms[room].delete(team);}
 }
 return Array.from({length:4},(_,i)=>assignments.slice(i*perRound,(i+1)*perRound));
}
export function validateSchedule(draws:Draws,names:string[],strong:boolean[]=[]):DrawReport {
 const n=names.length;if(n<4||n%4||new Set(names).size!==n||draws.length!==4)throw new Error('四轮预排需要不同队伍、队伍数为 4 的倍数及 4 轮对阵');
 const roles=names.map(()=>[] as string[]),opponents=names.map(()=>new Set<number>());
 for(const rr of draws){if(rr.length!==n/4||rr.some(r=>r.length!==4)||rr.flat().sort((a,b)=>a-b).join()!==Array.from({length:n},(_,i)=>i).join())throw new Error('每轮必须让全部队伍各上场一次，每场恰好 4 队');for(const room of rr)room.forEach((t,pos)=>{roles[t].push(['OG','OO','CG','CO'][pos]);room.forEach(o=>{if(o!==t)opponents[t].add(o);});});}
 if(roles.some(r=>new Set(r).size!==4))throw new Error('每队必须分别担任一次 OG、OO、CG、CO');
 const counts=[...pairCounts(draws)].filter(Boolean),max=Math.max(...counts),upper=coverageUpper(n),average=2*upper/n;
 return {distinct_pairs:counts.length,repeated_pairs:counts.filter(c=>c>1).length,max_pair_meetings:max,coverage_optimal:counts.length===upper&&opponents.every(o=>o.size>=Math.floor(average)&&o.size<=Math.ceil(average)),strength:strengthMetrics(draws,strong),teams:names.map((name,i)=>({name,roles:roles[i],distinct_opponents:opponents[i].size}))};
}
const balancedDesign:Draws=[[[4,8,1,3],[11,2,9,6],[7,5,0,10]],[[6,4,7,5],[10,11,3,2],[0,9,8,1]],[[9,6,10,4],[1,3,11,7],[2,0,5,8]],[[8,7,4,11],[5,1,2,9],[3,10,6,0]]];
function relabelDesign(rng:PythonRandom):Draws {const labels=rng.shuffle(Array.from({length:12},(_,i)=>i));return rng.shuffle(balancedDesign.map(rr=>rng.shuffle(rr.map(room=>room.map(t=>labels[t])))));}
function objective(draws:Draws,options:DrawOptions,schools:string[],strong:boolean[]){
 const n=countTeams(draws),counts=pairCounts(draws),opponents=Array(n).fill(0);let distinct=0;
 for(let a=0;a<n;a++)for(let b=a+1;b<n;b++){const c=counts[a*n+b];if(c){distinct++;opponents[a]++;opponents[b]++;}}
 const schoolActive=new Set(schools.map(normalizeInstitution).filter(Boolean)).size>=options.schoolThreshold&&options.schoolAvoidance!=='off';const clashes=schoolActive?schoolCollisions(draws,schools):0;
 const strength=strengthMetrics(draws,strong);const upper=coverageUpper(n),target=2*upper/n;
 const spread=opponents.reduce((s,x)=>s+(x-target)**2,0);
 const cost=[options.schoolAvoidance==='strict'?clashes:0,strength&&!strength.room_balanced?1:0,upper-distinct,strength?Math.max(strength.strong_range,strength.other_range):0,strength?.exposure_variance??0,spread,options.schoolAvoidance==='prefer'?clashes:0];
 return {cost,energy:(options.schoolAvoidance==='strict'?clashes*1e12:0)+(strength&&!strength.room_balanced?1e9:0)+(upper-distinct)*1e6+(strength?Math.max(strength.strong_range,strength.other_range)*1e4+strength.exposure_variance*10:0)+spread+(options.schoolAvoidance==='prefer'?clashes*0.1:0),certified:clashes===0&&(!strength||strength.optimal)&&distinct===upper&&spread<1e-8};
}
const compare=(a:number[],b:number[])=>a.reduce((c,n,i)=>c||n-b[i],0);
export function scheduleScore(draws:Draws,options:DrawOptions=defaultDrawOptions,institutions:string[]=[],strong:boolean[]=[]){return objective(draws,options,institutions,strong).energy;}
export function optimizeGroups(seed:number,progress:((n:number)=>void)|undefined,options:DrawOptions=defaultDrawOptions,institutions:string[]=[],teamCount=institutions.length||12,strong:boolean[]=[]):Draws {
 validateDrawOptions(options,institutions,teamCount);
 const rng=new PythonRandom(seed),rooms=teamCount/4,marked=Array.from({length:teamCount},(_,i)=>i).filter(i=>strong[i]),other=Array.from({length:teamCount},(_,i)=>i).filter(i=>!strong[i]);
 const deadline=Date.now()+10_000;
 let best:Draws|null=null,bestMetric:ReturnType<typeof objective>|null=null;
 function consider(d:Draws){const metric=objective(d,options,institutions,strong);if(!bestMetric||compare(metric.cost,bestMetric.cost)<0){best=structuredClone(d);bestMetric=metric;}return metric;}
 if(teamCount===12){for(let i=0;i<(marked.length&&other.length?800:options.searchDepth==='deep'?24000:6000)&&Date.now()<deadline;i++){const d=relabelDesign(rng);const counts=d.map(rr=>rr.map(room=>room.filter(t=>strong[t]).length));if(marked.length&&other.length&&counts.some(c=>Math.max(...c)-Math.min(...c)>1))continue;const m=consider(d);if(m.certified){progress?.(1);return best!;}}}
 const attempts=options.searchDepth==='deep'?28:10,iterations=Math.min(14000,4000+teamCount*80);
 for(let restart=0;restart<attempts&&Date.now()<deadline;restart++){
  const rounds:Draws=restart===0&&best?structuredClone(best):Array.from({length:4},()=>{
   const candidates=Array.from({length:rooms},()=>[] as number[]),s=rng.shuffle([...marked]),w=rng.shuffle([...other]),order=rng.shuffle(Array.from({length:rooms},(_,i)=>i));
   order.forEach((v,i)=>{const take=Math.floor(marked.length/rooms)+Number(i<marked.length%rooms);candidates[v].push(...s.splice(0,take));});
   for(const v of order)while(candidates[v].length<4)candidates[v].push(w.pop()!);
   return candidates;
  });
  let current=consider(rounds);
  if(current.certified){progress?.(1);return best!;}
  if(rooms===1)break;
  for(let iteration=0;iteration<iterations&&Date.now()<deadline;iteration++){
   const r=rng.below(4),a=rng.below(rooms);let b=rng.below(rooms-1);if(b>=a)b++;const i=rng.below(4),j=rng.below(4);
   const x=rounds[r][a][i],y=rounds[r][b][j];
   if(Boolean(strong[x])!==Boolean(strong[y])){const ca=rounds[r][a].filter(t=>strong[t]).length,cb=rounds[r][b].filter(t=>strong[t]).length,delta=Number(!!strong[y])-Number(!!strong[x]);if(ca+delta<Math.floor(marked.length/rooms)||ca+delta>Math.ceil(marked.length/rooms)||cb-delta<Math.floor(marked.length/rooms)||cb-delta>Math.ceil(marked.length/rooms))continue;}
   [rounds[r][a][i],rounds[r][b][j]]=[y,x];
   const candidate=objective(rounds,options,institutions,strong),temperature=Math.max(0.5,1500*(1-iteration/iterations)**3);
   if(candidate.energy<=current.energy||rng.random()<Math.exp((current.energy-candidate.energy)/temperature))current=candidate;else [rounds[r][a][i],rounds[r][b][j]]=[x,y];
   if(!bestMetric||compare(current.cost,bestMetric.cost)<0){consider(rounds);if(current.certified){progress?.(1);return best!;}}
  }
  progress?.(Math.min(.98,(Date.now()-(deadline-10_000))/10_000));
 }
 if(!best||!bestMetric||(bestMetric as ReturnType<typeof objective>).cost.slice(0,2).some(x=>x>0))throw new Error('未找到满足强队分布和回避约束的排程，请调整回避方式或增加搜索强度');
 return best;
}
export function generateRandomDraw(seed:number,names:string[],mode:'random-new',progress?:((n:number)=>void),options:DrawOptions=defaultDrawOptions,institutions:string[]=[],strong:boolean[]=[]){
 if(new Set(names).size!==names.length)throw new Error('队伍名称不能重复');
 const groups=optimizeGroups(seed,progress,options,institutions,names.length,strong),draws=assignRoles(groups),report=validateSchedule(draws,names,strong);
 return {draws,original:draws,baseline:null,changed:0,report,seed,mode,options};
}
