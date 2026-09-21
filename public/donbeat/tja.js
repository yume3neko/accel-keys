(function(root){

function hasNoteScrollGimmick(notes,events){
 return notes.some(n=>{
  let lo=0,hi=events.length;while(lo<hi){const mid=(lo+hi)>>1;if(events[mid].time<=n.time)lo=mid+1;else hi=mid}
  if((lo?events[lo-1].scroll??1:1)!==1)return true;
  const end=n.end??n.time;
  for(let i=lo;i<events.length&&events[i].time<end;){
   let j=i;while(j+1<events.length&&events[j+1].time===events[i].time)j++;
   if((events[j].scroll??1)!==1)return true;i=j+1;
  }
  return false;
 });
}


function hasNoteFadeout(notes,fades){
 const events=fades.slice().sort((a,b)=>a.time-b.time);
 const targets=e=>e.mode==='all'?['info','lane','note','button']:[e.mode];
 return events.some((e,i)=>{
  if(e.direction!==0)return false;
  return targets(e).some(target=>{
   const restore=events.slice(i+1).find(f=>f.direction===1&&targets(f).includes(target));
   const end=restore?restore.end:Infinity;
   return notes.some(n=>n.time<end&&(n.end??n.time)>=e.time);
  });
 });
}

function parseTJA(text){const charts=[],warnings=new Set();let meta={},body=null;for(let raw of text.replace(/^\uFEFF/,'').split(/\r?\n/)){let line=raw.replace(/\/\/.*$/,'').trim();if(!line)continue;if(/^#START\b/i.test(line)){body=[];continue}if(/^#END\b/i.test(line)){if(body){charts.push(compile({...meta},body,warnings));body=null}continue}if(body){body.push(line);continue}const m=line.match(/^([A-Z0-9]+)\s*:(.*)$/i);if(m)meta[m[1].toUpperCase()]=m[2].replace(/[\u0000-\u001F\u007F]/g,'').trim()}if(body)throw Error('#ENDがありません。');if(!charts.length)throw Error('有効な#START〜#ENDが見つかりません。');return {charts,warnings:[...warnings]}}
function compile(meta,lines,warnings,choices=[]){let bpm=Number(meta.BPM)||120;if(bpm<=0)throw Error('BPMは正の数にしてください。');let time=-(Number(meta.OFFSET)||0),dummy=false,dummyOpacity=.7,measure=1,scroll=1,abscroll=1,hasAbscroll=false,gogo=false,barline=true,notes=[],bars=[],measures=[],beats=[],gogoEvents=[],fades=[],motion=[{time,bpm,scroll:abscroll,hs:scroll}],queue=[],roll=null,balloons=(meta.BALLOON||'').split(',').map(Number),balloonIndex=0,branch=false,skip=false,branchIndex=-1,branchEvents=[],sections=[],holds=[];
function command(line){if(/^#DUMMYSTART(?:\s|,|$)/i.test(line)){const arg=line.replace(/^#DUMMYSTART/i,'').trim();if(!arg){dummyOpacity=.7}else{const value=arg.startsWith(',')?arg.slice(1).trim():arg;const transparency=Number(value);if(!value||!Number.isFinite(transparency)||transparency<0||transparency>100)throw Error('#DUMMYSTARTの透明度は0〜100で指定してください。');dummyOpacity=1-transparency/100}dummy=true;return}if(/^#FADE,/i.test(line)){const parts=line.split(',').map(x=>x.trim()),direction=Number(parts[1]),duration=Number(parts[2]),mode=(parts[3]||'').toLowerCase();if(parts.length!==4||!['0','1'].includes(parts[1])||!parts[2]||!Number.isFinite(duration)||duration<0||!['all','info','lane','note','button'].includes(mode))throw Error('#FADEの指定が不正です。');fades.push({time,end:time+duration,direction,mode});return}const [key,...rest]=line.split(/\s+/),v=rest.join(' ');switch(key.toUpperCase()){case '#BPMCHANGE':{const n=Number(v);if(!(n>0))throw Error('BPMCHANGEの値が不正です。');bpm=n;motion.push({time,bpm,scroll:abscroll,hs:scroll});break}case '#MEASURE':{const [a,b]=v.split('/').map(Number);if(!(a>0&&b>0))throw Error('MEASUREの値が不正です。');measure=a/b;break}case '#SCROLL':if(Number.isFinite(Number(v))){scroll=Number(v);motion.push({time,bpm,scroll:abscroll,hs:scroll});}else warnings.add('複素数SCROLL');break;case '#ABSCROLL':{const n=Number(v);if(!v||!Number.isFinite(n))throw Error('ABSCROLLは有限の数値にしてください。');abscroll=n;hasAbscroll=true;motion.push({time,bpm,scroll:abscroll,hs:scroll});break}case '#DELAY':if(Number.isFinite(Number(v)))time+=Number(v);break;case '#GOGOSTART':gogo=true;gogoEvents.push({time,active:true});break;case '#GOGOEND':gogo=false;gogoEvents.push({time,active:false});break;case '#BARLINEOFF':barline=false;break;case '#BARLINEON':barline=true;break;case '#DUMMYEND':dummy=false;break;case '#SECTION':sections.push(time);break;case '#LEVELHOLD':holds.push(time);break;case '#BRANCHSTART':{const args=v.split(',').map(x=>x.trim()),low=Number(args[1]),high=Number(args[2]);if(!['p','r','s'].includes(args[0])||args.length!==3||!Number.isFinite(low)||!Number.isFinite(high))throw Error('BRANCHSTARTの条件が不正です。');const previousMeasure=measures[measures.length-1];branchEvents.push({time,judgeTime:previousMeasure?.time??time,kind:args[0],low,high});break}default:warnings.add(key)}}
function flush(){const count=queue.filter(x=>typeof x==='number').length||1;let index=0,barAdded=false,measureStart=null;for(const item of queue){if(typeof item==='string'){command(item);continue}if(!barAdded){measureStart=time;if(barline)bars.push({time,bpm,scroll});barAdded=true}if(index%(Math.max(1,Math.round(count/(4*measure))))===0)beats.push({time,accent:index===0});if((item>=1&&item<=7)||item===9||item===99){const note={type:item===99?10:item,time,bpm,scroll,gogo,dummy,dummyOpacity};if((item>=5&&item<=7)||item===9){if(roll){roll.end=time;warnings.add('連打終端を補完')}roll=note;note.hits=0;if(item===7||item===9)note.required=balloons[balloonIndex++]||5}else if(roll){roll.end=time;roll=null}notes.push(note)}else if(item===8){if(roll){roll.end=time;roll=null}}else if(item!==0)warnings.add('音符'+item);time+=240/bpm*measure/count;index++}if(!index){measureStart=time;if(barline)bars.push({time,bpm,scroll});beats.push({time,accent:true});time+=240/bpm*measure}measures.push({time:measureStart,end:time});queue=[]}
for(const line of lines){if(/^#BRANCHSTART/i.test(line)){branch=true;branchIndex++;skip=false;queue.push(line);continue}if(branch&&/^#[NEM]$/i.test(line)){skip=line.toUpperCase()!=='#'+(choices[branchIndex]||'N');continue}if(/^#BRANCHEND/i.test(line)){branch=false;skip=false;continue}if(skip)continue;if(line[0]==='#'){queue.push(line);continue}for(const c of line.replace(/\s/g,'')){if(c===',')flush();else if(/[0-9]/.test(c))queue.push(Number(c));else if(/[dD]/.test(c))queue.push(99);else warnings.add('音符'+c)}}if(queue.some(x=>typeof x==='number'))flush();for(const pending of queue)if(typeof pending==='string')command(pending);if(roll)roll.end=time;notes.sort((a,b)=>a.time-b.time);if(!notes.length)throw Error('演奏できる音符がありません。');let visual;if(hasAbscroll){let distance=0,previous=motion[0].time,rate=motion[0].bpm/120;visual=motion.map(e=>{distance+=(e.time-previous)*rate;previous=e.time;rate=e.bpm/120*e.scroll;return {...e,distance,rate}})}return {features:{fadeOnNotes:hasNoteFadeout(notes,fades),scrollOnNotes:hasNoteScrollGimmick(notes,motion)},_tja:{meta:{...meta},lines},branchEvents,sections,holds,meta,notes:notes.filter(n=>!n.dummy),dummyNotes:notes.filter(n=>n.dummy),bars,measures,beats,gogoEvents,fades,motion,visual,duration:time,bpm:Number(meta.BPM)||120}}
function branchReferenceNoteCount(chart){
 if(!chart)return 1;
 if(Number.isFinite(chart._branchMasterNoteCount))return Math.max(1,chart._branchMasterNoteCount);
 let count=(chart.notes||[]).filter(n=>n.type<=4).length;
 if(chart._tja&&chart.branchEvents?.length){
  try{
   const choices=new Array(chart.branchEvents.length).fill('M');
   const master=compile({...chart._tja.meta},chart._tja.lines,new Set(),choices);
   count=master.notes.filter(n=>n.type<=4).length;
  }catch{}
 }
 chart._branchMasterNoteCount=Math.max(1,count);
 return chart._branchMasterNoteCount;
}
function branchReachableRoutesForCount(e){
 const routeAt=v=>v>=e.high?'M':v>=e.low?'E':'N',set=new Set(),eps=1e-7;
 let values;
 if(e.kind==='p'){
  values=[0,100,e.low,e.high,e.low-eps,e.low+eps,e.high-eps,e.high+eps].map(v=>Math.max(0,Math.min(100,v)));
 }else{
  const top=Math.max(0,e.low,e.high)+1;
  values=[0,top,e.low,e.high,e.low-eps,e.low+eps,e.high-eps,e.high+eps].map(v=>Math.max(0,v));
 }
 for(const v of values)if(Number.isFinite(v))set.add(routeAt(v));
 return ['N','E','M'].filter(r=>set.has(r));
}
function branchNoteCountRange(chart){
 const plain=Math.max(0,(chart?.notes||[]).filter(n=>n.type<=4).length);
 if(!chart?._tja||!chart.branchEvents?.length)return {min:plain,max:plain};
 if(chart._branchNoteCountRange)return chart._branchNoteCountRange;
 try{
  const events=chart.branchEvents,baseChoices=events.map(e=>branchReachableRoutesForCount(e)[0]||'N');
  const count=choices=>compile({...chart._tja.meta},chart._tja.lines,new Set(),choices).notes.filter(n=>n.type<=4).length;
  const base=count(baseChoices);
  let min=base,max=base;
  for(let i=0;i<events.length;i++){
   const deltas=[];
   for(const route of branchReachableRoutesForCount(events[i])){
    const choices=[...baseChoices];choices[i]=route;deltas.push(count(choices)-base);
   }
   if(deltas.length){min+=Math.min(...deltas);max+=Math.max(...deltas)}
  }
  chart._branchNoteCountRange={min:Math.max(0,min),max:Math.max(0,max)};
 }catch{
  chart._branchNoteCountRange={min:plain,max:plain};
 }
 return chart._branchNoteCountRange;
}
root.rebuildTjaBranches=(chart,choices)=>({...chart,...compile({...chart._tja.meta},chart._tja.lines,new Set(),choices)});
root.branchReferenceNoteCount=branchReferenceNoteCount;
root.branchNoteCountRange=branchNoteCountRange;
root.parseTJA=parseTJA;
if(typeof module!=='undefined')module.exports={parseTJA,branchReferenceNoteCount,branchNoteCountRange};
})(typeof window!=='undefined'?window:globalThis);
