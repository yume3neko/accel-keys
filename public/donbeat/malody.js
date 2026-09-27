(function(root){
'use strict';
function beat(b){if(!Array.isArray(b)||b.length!==3||!b.every(Number.isFinite)||b[2]<=0)throw Error('Malodyの拍位置が不正です。');return b[0]+b[1]/b[2]}

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

function parseMalody(text){
 const d=JSON.parse(text.replace(/^\uFEFF/,''));if(Number(d.meta?.mode)!==5)throw Error('Malodyは太鼓モード（mode:5）のみ対応しています。');
 if(!Array.isArray(d.time)||!d.time.length||!Array.isArray(d.note))throw Error('BPMまたは音符データがありません。');
 const warnings=new Set(),timing=d.time.map(e=>({beat:beat(e.beat),bpm:Number(e.bpm)})).sort((a,b)=>a.beat-b.beat);
 if(timing.some(e=>!(e.bpm>0&&Number.isFinite(e.bpm))))throw Error('BPMの値が不正です。');
 timing[0].seconds=timing[0].beat*60/timing[0].bpm;
 for(let i=1;i<timing.length;i++)timing[i].seconds=timing[i-1].seconds+(timing[i].beat-timing[i-1].beat)*60/timing[i-1].bpm;
 const at=b=>{let lo=0,hi=timing.length;while(lo+1<hi){const m=(lo+hi)>>1;if(timing[m].beat<=b)lo=m;else hi=m}return timing[lo]};
 const seconds=b=>{const e=at(b);return e.seconds+(b-e.beat)*60/e.bpm};
 const sounds=d.note.filter(n=>n.sound&&Number(n.type)===1);if(sounds.length>1)warnings.add('複数BGMは先頭のみ再生');
 const sound=sounds[0],offset=sound?seconds(beat(sound.beat))+(Number(sound.offset)||0)/1000:0;
 const effects=(d.effect||[]).map(e=>({...e,position:beat(e.beat)})).sort((a,b)=>a.position-b.position);let scroll=1,gogo=false,showbar=true,hs=1;const states=[];
 for(const e of effects){for(const k of Object.keys(e))if(!['beat','position','scroll','showbar','ggt','jump','hs','sign','fade','endbeat','mode'].includes(k))warnings.add(k+'演出は未対応');if(e.scroll!==undefined){if(!Number.isFinite(e.scroll))throw Error('scrollの値が不正です。');scroll=e.scroll;}if(e.hs!==undefined){if(!Number.isFinite(e.hs))throw Error('hsの値が不正です。');hs=e.hs}if(e.jump!==undefined&&!Number.isFinite(e.jump))throw Error('jumpの値が不正です。');if(e.ggt!==undefined)gogo=!!e.ggt;if(e.showbar!==undefined)showbar=!!e.showbar;states.push({beat:e.position,scroll,gogo,showbar,hs})}
 const stateAt=b=>{let s={scroll:1,gogo:false,showbar:true,hs:1};for(const e of states){if(e.beat>b)break;s=e}return s};
 const fades=effects.filter(e=>e.fade!==undefined).map(e=>{const mode=String(e.mode||'').toLowerCase(),end=beat(e.endbeat);if(![0,1].includes(e.fade)||end<e.position||!['all','info','lane','note','button'].includes(mode))throw Error('fadeの指定が不正です。');return {time:seconds(e.position)-offset,end:seconds(end)-offset,direction:e.fade,mode}});
 const map=[1,3,2,4,5,6,7,10],notes=[];let lastBeat=0;
 for(const n of d.note){if(n.sound&&n.type)continue;const style=Number(n.style??0),dummy=Number.isInteger(style)&&style>=10&&style<=97,type=map[dummy?style%10:style];if(type===undefined){warnings.add('音符style:'+n.style+'は未対応');continue}const b=beat(n.beat),s=stateAt(b),note={type,dummy,dummyOpacity:dummy?(9-Math.floor(style/10))/8:1,time:seconds(b)-offset,bpm:at(b).bpm,scroll:s.hs,gogo:s.gogo};lastBeat=Math.max(lastBeat,b);
 if(type>=5&&type<=7){if(!n.endbeat)throw Error('連打・風船の終点がありません。');const end=beat(n.endbeat);if(end<b)throw Error('連打の終点が始点より前です。');note.end=seconds(end)-offset;note.hits=0;lastBeat=Math.max(lastBeat,end);if(type===7){note.required=Number(n.hits);if(!Number.isInteger(note.required)||note.required<1)throw Error('風船の必要打数が不正です。')}}notes.push(note)}
 if(!notes.length)throw Error('演奏できる太鼓の音符がありません。');notes.sort((a,b)=>a.time-b.time);
 // sign is the number of quarter-note beats per bar; it never retimes notes.
 const signatures=effects.filter(e=>e.sign!==undefined);
 if(signatures.some(e=>!Number.isFinite(e.sign)||e.sign<=0))throw Error('signは0より大きい数にしてください。');
 const bars=[],measures=[],barStart=Number(d.meta.mode_ext?.bar_begin)||0;
 let signature=4,signatureIndex=0;
 for(let b=barStart,steps=0;b<=lastBeat&&steps<50000;steps++){
  while(signatureIndex<signatures.length&&signatures[signatureIndex].position<=b){signature=signatures[signatureIndex++].sign}
  const s=stateAt(b);if(s.showbar)bars.push({time:seconds(b)-offset,bpm:at(b).bpm,scroll:s.hs});
  // A change starts a new measure, even when placed inside the old measure.
  const next=Math.min(b+signature,signatures[signatureIndex]?.position??Infinity);
  if(!(next>b))throw Error('signの間隔が小さすぎます。');measures.push({time:seconds(b)-offset,end:seconds(next)-offset,numerator:signature,denominator:4});b=next;
 }
 // Visual distance is separate from audio/judgment time. Positive jump advances it.
 const events=[...timing.map(e=>({time:seconds(e.beat)-offset,bpm:e.bpm})),...effects.map(e=>({time:seconds(e.position)-offset,scroll:e.scroll,hs:e.hs,jump:e.jump}))].sort((a,b)=>a.time-b.time);
 let visualBpm=timing[0].bpm,visualScroll=1,visualHs=1,jumpDistance=0,distance=0,previous=events[0]?.time||0;
 const visual=[];
 for(const e of events){distance+=(e.time-previous)*visualBpm/120*visualScroll;previous=e.time;if(e.bpm!==undefined)visualBpm=e.bpm;if(e.scroll!==undefined)visualScroll=e.scroll;if(e.hs!==undefined)visualHs=e.hs;jumpDistance+=(e.jump||0)/1000*visualBpm/120*visualScroll*visualHs;visual.push({time:e.time,distance,jumpDistance,rate:visualBpm/120*visualScroll,bpm:visualBpm,scroll:visualScroll,hs:visualHs})}
 const song=d.meta.song||{},version=d.meta.version||'Malody',level=Number.isFinite(d.meta.level)&&d.meta.level>0?d.meta.level:version.match(/[☆★]\s*(\d+)/)?.[1]||'?';
 const features={fadeOnNotes:hasNoteFadeout(notes,fades),scrollOnNotes:hasNoteScrollGimmick(notes,visual),soflan:timing.some(e=>e.bpm!==timing[0].bpm)||effects.some(e=>(e.scroll!==undefined&&e.scroll!==1)||(e.hs!==undefined&&e.hs<0)),fadeout:effects.some(e=>e.fade===0)};
 return {charts:[{features,meta:{TITLE:song.titleorg||song.title||'無題',SUBTITLE:[song.artistorg||song.artist,d.meta.creator].filter(Boolean).join(' / '),COURSE:version,LEVEL:level,VIDEO:d.meta.video||'',WAVE:sound?.sound||''},notes:notes.filter(n=>!n.dummy),dummyNotes:notes.filter(n=>n.dummy),bars,measures,visual,fades,gogoEvents:effects.filter(e=>e.ggt!==undefined).map(e=>({time:seconds(e.position)-offset,active:!!e.ggt})),beats:[],bpm:timing[0].bpm,duration:seconds(lastBeat)-offset,warnings:[...warnings]}],warnings:[...warnings]};
}
// Read only the ZIP directory and one entry at a time. In particular, large
// medley packs must not be copied into a single multi-gigabyte ArrayBuffer.
const CHART_ARCHIVE_LIMIT=1024*1024*1024,CHART_ARCHIVE_EXPANDED_LIMIT=2*1024*1024*1024;
async function readChartArchive(file){
 if(file.size>CHART_ARCHIVE_LIMIT)throw Error('MCZ / ZIPは1GB以下にしてください。大きい場合は解凍してフォルダを選択してください。');
 const tailSize=Math.min(file.size,65557),tail=new Uint8Array(await file.slice(file.size-tailSize).arrayBuffer()),tailView=new DataView(tail.buffer);
 let end=-1;
 for(let p=tail.length-22;p>=0;p--)if(tailView.getUint32(p,true)===0x06054b50&&p+22+tailView.getUint16(p+20,true)===tail.length){end=p;break}
 if(end<0)throw Error('有効なZIP形式ではありません。');
 const count=tailView.getUint16(end+10,true),directorySize=tailView.getUint32(end+12,true),directoryOffset=tailView.getUint32(end+16,true);
 if(tailView.getUint16(end+4,true)||tailView.getUint16(end+6,true)||count===65535||directoryOffset===0xffffffff||directorySize===0xffffffff)throw Error('分割ZIP・ZIP64には対応していません。解凍してフォルダを選択してください。');
 const absoluteEnd=file.size-tailSize+end;
 if(directorySize>16*1024*1024||directoryOffset+directorySize>absoluteEnd)throw Error('ZIPの一覧が破損しています。');
 const directory=new Uint8Array(await file.slice(directoryOffset,directoryOffset+directorySize).arrayBuffer()),v=new DataView(directory.buffer);
 let p=0,total=0;const entries=[];
 for(let i=0;i<count;i++){
  if(p+46>directory.length||v.getUint32(p,true)!==0x02014b50)throw Error('ZIPの一覧が破損しています。');
  const flags=v.getUint16(p+8,true),method=v.getUint16(p+10,true),compressed=v.getUint32(p+20,true),size=v.getUint32(p+24,true),nl=v.getUint16(p+28,true),extra=v.getUint16(p+30,true),comment=v.getUint16(p+32,true),local=v.getUint32(p+42,true),crc=v.getUint32(p+16,true);
  if(p+46+nl+extra+comment>directory.length)throw Error('ZIPの一覧が不完全です。');
  const nameBytes=directory.subarray(p+46,p+46+nl);let name;
  try{name=new TextDecoder('utf-8',{fatal:true}).decode(nameBytes)}catch{name=new TextDecoder('shift-jis').decode(nameBytes)}p+=46+nl+extra+comment;
  if(!/\.(mc|tja|json|dan|txt|mp4|webm|m4v|ogg|mp3|wav|m4a|flac|png|jpe?g|webp|gif)$/i.test(name))continue;
  if(flags&1)throw Error('パスワード付きZIPには対応していません。');
  if(![0,8].includes(method))throw Error('このZIP圧縮方式には対応していません。');
  if(size>256*1024*1024||(total+=size)>CHART_ARCHIVE_EXPANDED_LIMIT)throw Error('展開後のファイルは1つ256MB、合計2GB以下にしてください。大きい場合は解凍してフォルダを選択してください。');
  if(entries.length>=10000)throw Error('ZIP内のファイル数が多すぎます。');
  entries.push({name,flags,method,compressed,size,local,crc});
 }
 if(p!==directory.length)throw Error('ZIPの一覧が不完全です。');
 if(!entries.some(e=>/\.(mc|tja|json|dan|txt)$/i.test(e.name)))throw Error('MCZ / ZIP内にMC・TJA譜面または段位設定ファイルがありません。');
 const files=[];
 for(const entry of entries){
  const {name,flags,method,compressed,size,local,crc}=entry;
  if(local+30>directoryOffset)throw Error('ZIPのファイル情報が破損しています。');
  const header=new DataView(await file.slice(local,local+30).arrayBuffer());
  if(header.getUint32(0,true)!==0x04034b50||header.getUint16(8,true)!==method||header.getUint16(6,true)!==flags)throw Error('ZIPのファイル情報が破損しています。');
  const begin=local+30+header.getUint16(26,true)+header.getUint16(28,true);
  if(begin+compressed>directoryOffset)throw Error('ZIPのデータが不完全です。');
  const source=file.slice(begin,begin+compressed);
  let payload;
  if(method===8){
   let stream;try{stream=source.stream().pipeThrough(new DecompressionStream('deflate-raw'))}
   catch{throw Error('このブラウザではMCZ展開を利用できません。ZIPを解凍してフォルダを選択してください。')}
   const reader=stream.getReader(),chunks=[];let length=0,check=0xffffffff;
   try{while(true){const r=await reader.read();if(r.done)break;length+=r.value.length;if(length>size){await reader.cancel();throw Error('ZIPの展開サイズが不正です。')}check=crc32Update(r.value,check);chunks.push(r.value)}}catch(e){throw Error('ZIPのデータを展開できませんでした：'+(e.message||e))}
   if(length!==size||(check^0xffffffff)>>>0!==crc)throw Error('ZIPの整合性確認に失敗しました。');
   payload=chunks;
  }else{
   if(compressed!==size)throw Error('ZIPのデータが不完全です。');
   let check=0xffffffff;const reader=source.stream().getReader();while(true){const r=await reader.read();if(r.done)break;check=crc32Update(r.value,check)}
   if((check^0xffffffff)>>>0!==crc)throw Error('ZIPの整合性確認に失敗しました。');
   payload=[source];
  }
  const f=new File(payload,name.split(/[\\/]/).pop());Object.defineProperty(f,'chartPath',{value:name.replace(/\\/g,'/')});files.push(f);
 }
 return files;
}
const crcTable=Array.from({length:256},(_,i)=>{for(let j=0;j<8;j++)i=(i&1)?0xedb88320^(i>>>1):i>>>1;return i>>>0});
function crc32Update(data,seed=0xffffffff){let c=seed;for(const b of data)c=crcTable[(c^b)&255]^(c>>>8);return c>>>0}
function crc32(data){return (crc32Update(data)^0xffffffff)>>>0}
function malodyDistance(chart,t,hs=1){const events=chart.visual;if(!events?.length)return t*chart.bpm/120*hs;let lo=0,hi=events.length;if(t<events[0].time)return (events[0].distance+(t-events[0].time)*chart.bpm/120)*hs;while(lo+1<hi){const mid=(lo+hi)>>1;if(events[mid].time<=t)lo=mid;else hi=mid}const e=events[lo];return (e.distance+(t-e.time)*e.rate+(e.jumpDistance||0))*hs}
Object.assign(root,{parseMalody,readChartArchive,malodyDistance});if(typeof module!=='undefined')module.exports={parseMalody,readChartArchive,malodyDistance};
})(typeof window!=='undefined'?window:globalThis);
