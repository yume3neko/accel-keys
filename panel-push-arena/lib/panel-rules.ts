export type BaseDifficulty="easy"|"normal"|"hard"|"expert"|"master"|"lunatic";
export type Difficulty=BaseDifficulty|`ura_${BaseDifficulty}`;
export const difficultyRanges:Record<Difficulty,[number,number]>={easy:[1,3],normal:[3,7],hard:[5,10],expert:[7,15],master:[9,17],lunatic:[12,22],ura_easy:[1,3],ura_normal:[3,7],ura_hard:[5,10],ura_expert:[7,15],ura_master:[9,17],ura_lunatic:[12,22]};
export function difficultyLabel(d:string){return d.startsWith('ura_')?'裏'+d.slice(4).toUpperCase():d.toUpperCase()}
export function targetCount(difficulty:string,round:number){const [min,max]=difficultyRanges[difficulty as Difficulty]??difficultyRanges.normal;return Math.min(max,min+Math.floor(round/2))}
export function pattern(seed:number,round:number,count:number){let x=(seed^Math.imul(round+1,0x9e3779b1))>>>0;const a=Array.from({length:25},(_,i)=>i);for(let i=24;i>0;i--){x=(Math.imul(x,1664525)+1013904223)>>>0;const j=x%(i+1);[a[i],a[j]]=[a[j],a[i]]}return a.slice(0,count)}
export function boardPattern(seed:number,round:number,difficulty:string){
 const cells=pattern(seed,round,targetCount(difficulty,round));
 if(!difficulty.startsWith('ura_'))return {safe:cells,damage:[] as number[],rate:0};
 let x=(seed^Math.imul(round+1,0x85ebca6b)^0xc2b2ae35)>>>0;
 const random=()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296};
 const rates:Record<string,number>={ura_easy:10,ura_normal:20,ura_hard:30,ura_expert:35,ura_master:40};
 const rate=difficulty==='ura_lunatic'?10+Math.floor(random()*41):rates[difficulty]??0;
 const damage=cells.filter(()=>random()*100<rate);
 // A board must always have a normal target, including one-tile EASY boards.
 if(damage.length===cells.length)damage.splice(Math.floor(random()*damage.length),1);
 return {safe:cells.filter(i=>!damage.includes(i)),damage,rate};
}
