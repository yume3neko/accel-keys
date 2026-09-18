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

function hbMs(t){return Math.trunc(Number(t)*1000);}
function hbTrunc(t){return Math.trunc(Number(t)*1000)/1000;}
function hbSegmentAt(chart,t){
 const ms=hbMs(t),delays=chart?.hbDelays||[];
 // Jiro1 freeze behavior: effective positive delays are resolved in definition order.
 for(const d of delays){
  const a=hbMs(d.startTime),b=hbMs(d.endTime);
  if(ms>=Math.min(a,b)&&ms<Math.max(a,b))return {kind:'delay',...d};
 }
 const segments=chart?.hbSegments||[];
 // Overlapping beat-time sections use the latest-defined section.
 for(let i=segments.length-1;i>=0;i--){
  const e=segments[i],a=hbMs(e.startTime),b=hbMs(e.endTime);
  if(ms>=Math.min(a,b)&&ms<=Math.max(a,b))return {kind:'segment',...e};
 }
 return null;
}
function hbVisualStateAt(chart,t){
 const e=hbSegmentAt(chart,t);
 if(e?.kind==='delay')return {beat:e.beat,bpm:0,scroll:e.scroll??1,segment:e};
 if(e){
  const span=e.endTime-e.startTime;
  const ratio=Math.abs(span)<1e-12?1:(t-e.startTime)/span;
  return {beat:e.startBeat+(e.endBeat-e.startBeat)*ratio,bpm:e.bpm,scroll:e.scroll??1,segment:e};
 }
 const initialTime=chart?.hbInitialTime??0,initialBeat=chart?.hbInitialBeat??0,initialBpm=chart?.hbInitialBpm??chart?.bpm??120;
 return {beat:initialBeat+(t-initialTime)*initialBpm/60,bpm:initialBpm,scroll:1,segment:null};
}
function hbVisualBeatAt(chart,t){return hbVisualStateAt(chart,t).beat;}

function parseTJA(text){const charts=[],warnings=new Set();let meta={},body=null,scrollMode='normal';for(let raw of text.replace(/^\uFEFF/,'').split(/\r?\n/)){let line=raw.replace(/\/\/.*$/,'').trim();if(!line)continue;if(!body&&/^#HBSCROLL\b/i.test(line)){scrollMode='hb';continue}if(!body&&/^#NMSCROLL\b/i.test(line)){scrollMode='normal';continue}if(/^#START\b/i.test(line)){body=[];continue}if(/^#END\b/i.test(line)){if(body){charts.push(compile({...meta},body,warnings,[],scrollMode));body=null}continue}if(body){body.push(line);continue}const m=line.match(/^([A-Z0-9]+)\s*:(.*)$/i);if(m)meta[m[1].toUpperCase()]=m[2].trim()}if(body)throw Error('#ENDがありません。');if(!charts.length)throw Error('有効な#START〜#ENDが見つかりません。');return {charts,warnings:[...warnings]}}
function compile(meta,lines,warnings,choices=[],initialScrollMode='normal'){let bpm=Number(meta.BPM)||120;if(bpm<=0)throw Error('BPMは正の数にしてください。');const hbInitialTime=-(Number(meta.OFFSET)||0),hbInitialBpm=bpm;let time=hbInitialTime,visualBeat=0,dummy=false,dummyOpacity=.7,measure=1,scroll=1,abscroll=1,hasAbscroll=false,hasHbscroll=initialScrollMode==='hb',gogo=false,barline=true,notes=[],bars=[],measures=[],beats=[],gogoEvents=[],fades=[],motion=[{time,bpm,scroll:abscroll,hs:scroll,hb:hasHbscroll}],queue=[],roll=null,balloons=(meta.BALLOON||'').split(',').map(Number),balloonIndex=0,branch=false,skip=false,branchIndex=-1,branchEvents=[],sections=[],holds=[],hbSegments=[],hbDelays=[],hbOrder=0,hbMaxTime=time;
function hbTime(v){return hasHbscroll?hbTrunc(v):v}
function advanceBeat(deltaBeat){const deltaTime=deltaBeat*60/bpm;if(hasHbscroll)hbSegments.push({order:hbOrder++,startTime:time,endTime:time+deltaTime,startBeat:visualBeat,endBeat:visualBeat+deltaBeat,bpm,scroll});time+=deltaTime;visualBeat+=deltaBeat;hbMaxTime=Math.max(hbMaxTime,time)}
function command(line){if(/^#DUMMYSTART(?:\s|,|$)/i.test(line)){const arg=line.replace(/^#DUMMYSTART/i,'').trim();if(!arg){dummyOpacity=.7}else{const value=arg.startsWith(',')?arg.slice(1).trim():arg;const transparency=Number(value);if(!value||!Number.isFinite(transparency)||transparency<0||transparency>100)throw Error('#DUMMYSTARTの透明度は0〜100で指定してください。');dummyOpacity=1-transparency/100}dummy=true;return}if(/^#FADE,/i.test(line)){const parts=line.split(',').map(x=>x.trim()),direction=Number(parts[1]),duration=Number(parts[2]),mode=(parts[3]||'').toLowerCase();if(parts.length!==4||!['0','1'].includes(parts[1])||!parts[2]||!Number.isFinite(duration)||duration<0||!['all','info','lane','note','button'].includes(mode))throw Error('#FADEの指定が不正です。');fades.push({time,end:time+duration,direction,mode});return}const [key,...rest]=line.split(/\s+/),v=rest.join(' ');switch(key.toUpperCase()){case '#BPMCHANGE':{const n=Number(v);if(!Number.isFinite(n)||n===0)throw Error('BPMCHANGEは0以外の有限数で指定してください。');if(hasHbscroll)time=hbTrunc(time);bpm=n;motion.push({time,bpm,scroll:abscroll,hs:scroll,hb:hasHbscroll});break}case '#MEASURE':{const [a,b]=v.split('/').map(Number);if(!Number.isFinite(a)||!Number.isFinite(b)||a===0||b===0)throw Error('MEASUREは0以外の有限数/有限数で指定してください。');measure=a/b;break}case '#SCROLL':if(Number.isFinite(Number(v))){scroll=Number(v);motion.push({time,bpm,scroll:abscroll,hs:scroll});}else warnings.add('複素数SCROLL');break;case '#ABSCROLL':{const n=Number(v);if(!v||!Number.isFinite(n))throw Error('ABSCROLLは有限の数値にしてください。');abscroll=n;hasAbscroll=true;motion.push({time,bpm,scroll:abscroll,hs:scroll});break}case '#DELAY':{let delay=Number(v);if(Number.isFinite(delay)){if(hasHbscroll)delay=hbTrunc(delay);if(hasHbscroll&&delay>0){const start=time,effective=hbMs(start)>=hbMs(hbMaxTime);time+=delay;if(effective)hbDelays.push({order:hbOrder++,startTime:start,endTime:time,beat:visualBeat,bpm,scroll});hbMaxTime=Math.max(hbMaxTime,time)}else if(hasHbscroll&&delay<0){time+=delay;visualBeat+=delay*bpm/60}else time+=delay}break}case '#GOGOSTART':gogo=true;gogoEvents.push({time,active:true});break;case '#GOGOEND':gogo=false;gogoEvents.push({time,active:false});break;case '#BARLINEOFF':barline=false;break;case '#BARLINEON':barline=true;break;case '#DUMMYEND':dummy=false;break;case '#SECTION':sections.push(time);break;case '#LEVELHOLD':holds.push(time);break;case '#BRANCHSTART':{const args=v.split(',').map(x=>x.trim()),low=Number(args[1]),high=Number(args[2]);if(!['p','r','s'].includes(args[0])||args.length!==3||!Number.isFinite(low)||!Number.isFinite(high))throw Error('BRANCHSTARTの条件が不正です。');branchEvents.push({time,kind:args[0],low,high});break}default:warnings.add(key)}}
function flush(){const count=queue.filter(x=>typeof x==='number').length||1;let index=0,barAdded=false,measureStart=null,measureBeatStart=null;for(const item of queue){if(typeof item==='string'){command(item);continue}if(!barAdded){measureStart=hbTime(time);measureBeatStart=visualBeat;if(barline)bars.push({time:hbTime(time),bpm,scroll,visualBeat,definitionIndex:hbOrder});barAdded=true}if(index%(Math.max(1,Math.round(Math.abs(count/(4*measure)))))===0)beats.push({time,accent:index===0});if((item>=1&&item<=7)||item===9){const note={type:item,time:hbTime(time),bpm,scroll,gogo,dummy,dummyOpacity,visualBeat,definitionIndex:hbOrder};if(item>=5&&item<=7){if(roll){roll.end=hbTime(time);roll.visualEnd=visualBeat;warnings.add('連打終端を補完')}roll=note;note.hits=0;if(item===7)note.required=balloons[balloonIndex++]||5}else if(roll){roll.end=hbTime(time);roll.visualEnd=visualBeat;roll=null}notes.push(note)}else if(item===8){if(roll){roll.end=hbTime(time);roll.visualEnd=visualBeat;roll=null}}else if(item!==0)warnings.add('音符'+item);advanceBeat(4*measure/count);index++}if(!index){measureStart=time;measureBeatStart=visualBeat;if(barline)bars.push({time,bpm,scroll,visualBeat,definitionIndex:hbOrder});beats.push({time,accent:true});advanceBeat(4*measure)}measures.push({time:measureStart,end:hbTime(time),visualBeat:measureBeatStart,visualEnd:visualBeat});queue=[]}
for(const line of lines){if(/^#BRANCHSTART/i.test(line)){branch=true;branchIndex++;skip=false;queue.push(line);continue}if(branch&&/^#[NEM]$/i.test(line)){skip=line.toUpperCase()!=='#'+(choices[branchIndex]||'N');continue}if(/^#BRANCHEND/i.test(line)){branch=false;skip=false;continue}if(skip)continue;if(line[0]==='#'){queue.push(line);continue}for(const c of line.replace(/\s/g,'')){if(c===',')flush();else if(/[0-9]/.test(c))queue.push(Number(c));else warnings.add('音符'+c)}}if(queue.some(x=>typeof x==='number'))flush();for(const pending of queue)if(typeof pending==='string')command(pending);if(roll){roll.end=hbTime(time);roll.visualEnd=visualBeat}notes.sort((a,b)=>a.time-b.time);if(!notes.length)throw Error('演奏できる音符がありません。');
 if(hasHbscroll){
  const hbChart={hbSegments,hbDelays,hbInitialTime,hbInitialBeat:0,hbInitialBpm,bpm:Number(meta.BPM)||120};
  for(const n of notes){
   const st=hbVisualStateAt(hbChart,n.time);
   n.visualBeat=st.beat;
   if(Number.isFinite(st.bpm)&&st.bpm!==0)n.bpm=st.bpm;
   if(Number.isFinite(st.scroll))n.scroll=st.scroll;
   if(n.end!==undefined)n.visualEnd=hbVisualBeatAt(hbChart,n.end);
  }
  for(const b of bars){
   const st=hbVisualStateAt(hbChart,b.time);
   b.visualBeat=st.beat;
   if(Number.isFinite(st.scroll))b.scroll=st.scroll;
  }
  for(const m of measures){m.visualBeat=hbVisualBeatAt(hbChart,m.time);m.visualEnd=hbVisualBeatAt(hbChart,m.end)}
 }
 let visual;if(hasAbscroll&&!hasHbscroll){let distance=0,previous=motion[0].time,rate=motion[0].bpm/120;visual=motion.map(e=>{distance+=(e.time-previous)*rate;previous=e.time;rate=e.bpm/120*e.scroll;return {...e,distance,rate}})}
 return {features:{fadeOnNotes:hasNoteFadeout(notes,fades),scrollOnNotes:hasHbscroll||hasNoteScrollGimmick(notes,motion),hbscroll:hasHbscroll},_tja:{meta:{...meta},lines,scrollMode:initialScrollMode},branchEvents,sections,holds,meta,notes:notes.filter(n=>!n.dummy),dummyNotes:notes.filter(n=>n.dummy),bars,measures,beats,gogoEvents,fades,motion,visual,hbSegments:hasHbscroll?hbSegments:null,hbDelays:hasHbscroll?hbDelays:null,hbInitialTime,hbInitialBeat:0,hbInitialBpm,duration:hbTime(time),bpm:Number(meta.BPM)||120}}
root.rebuildTjaBranches=(chart,choices)=>({...chart,...compile({...chart._tja.meta},chart._tja.lines,new Set(),choices,chart._tja.scrollMode||'normal')});Object.assign(root,{parseTJA,hbVisualBeatAt,hbVisualStateAt,hbSegmentAt});if(typeof module!=='undefined')module.exports={parseTJA,hbVisualBeatAt,hbVisualStateAt,hbSegmentAt};})(typeof window!=='undefined'?window:globalThis);
