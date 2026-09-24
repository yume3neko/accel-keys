// ESE category 08: read one Live Festival setlist on demand (never mirror the collection).
const ORIGIN='https://ese.tjadataba.se';
const TREE=ORIGIN+'/api/v1/repos/ESE/ESE/contents';
const RAW=ORIGIN+'/ESE/ESE/raw/branch/master';
const isTja=name=>/\.tja$/i.test(name);
const isAudio=name=>/\.(?:ogg|mp3|wav|m4a|flac|opus|aac)$/i.test(name);
const isVideo=name=>/\.(?:mp4|webm|m4v)$/i.test(name);
const encodePath=path=>path.split('/').map(encodeURIComponent).join('/');
const base=path=>path.split('/').pop();
const parent=path=>path.split('/').slice(0,-1).join('/');
const clean=s=>String(s||'').normalize('NFKC').trim().toLowerCase().replace(/\\/g,'/');
const fail=(message,status=502)=>Response.json({error:message},{status,headers:{'cache-control':'no-store'}});
async function request(url,limit=18000){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),limit);
 try{const r=await fetch(url,{signal:ctrl.signal});if(!r.ok)throw Error('ESE HTTP '+r.status);return r}
 finally{clearTimeout(timer)}
}
async function list(path){
 const r=await request(TREE+'/'+encodePath(path)+'?ref=master');
 const data=await r.json();
 if(!Array.isArray(data))throw Error('ESEのフォルダ形式が不正です。');
 return data.filter(x=>x&&['dir','file'].includes(x.type)&&typeof x.path==='string'&&x.path.startsWith(path+'/')&&x.path.split('/').length===path.split('/').length+1&&!x.name.startsWith('.'));
}
async function textFile(path,limit=3*1024*1024){
 const r=await request(RAW+'/'+encodePath(path),30000);
 if(Number(r.headers.get('content-length'))>limit)throw Error('譜面または設定ファイルが大きすぎます。');
 const bytes=await r.arrayBuffer();if(bytes.byteLength>limit)throw Error('譜面または設定ファイルが大きすぎます。');
 try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^\uFEFF/,'')}
 catch{return new TextDecoder('shift-jis').decode(bytes).replace(/^\uFEFF/,'')}
}
function tjaInfo(text,path){
 const fields={};
 for(const raw of text.split(/\r?\n/)){
  const line=raw.replace(/\/\/.*$/,'').trim();if(/^#START\b/i.test(line))break;
  const match=line.match(/^([A-Z][A-Z0-9]*)\s*:\s*(.*)$/i);
  if(match&&!Object.hasOwn(fields,match[1].toUpperCase()))fields[match[1].toUpperCase()]=match[2].trim();
 }
 const courses=[...text.matchAll(/^\s*COURSE\s*:\s*(.+)$/gmi)].map(x=>x[1].trim());
 const levels=[...text.matchAll(/^\s*LEVEL\s*:\s*(.+)$/gmi)].map(x=>x[1].trim());
 const title=fields.TITLEJA||fields.TITLE||base(path).replace(/\.tja$/i,'');
 const charts=courses.length?courses.map((course,i)=>({course,level:levels[i]||'?'})):[{course:'Oni',level:'?'}];
 const segments=[];
 for(const raw of text.split(/\r?\n/)){
  const match=raw.trim().match(/^#NEXTSONG\s+(.+)$/i);
  if(!match)continue;
  const fields=match[1].split(',').map(s=>s.trim());
  const wave=fields.find(s=>isAudio(s))||'';
  segments.push({title:fields[0]||'',wave});
 }
 return {path,title,subtitle:fields.SUBTITLEJA||fields.SUBTITLE||'',bpm:fields.BPM||'',wave:fields.WAVE||'',videoName:fields.VIDEO||'',charts,segments};
}
function manifestInfo(text){
 let name='',songs=[];
 if(text.trim().startsWith('{')){
  try{
   const data=JSON.parse(text);
   name=String(data.title||data.name||'');
   if(Array.isArray(data.songs))songs=data.songs.map(item=>{
    if(typeof item==='string')return {ref:item};
    return {ref:String(item?.chart||item?.file||item?.title||''),course:item?.course};
   }).filter(s=>s.ref);
  }catch{}
 }
 if(!songs.length){
  for(const line of text.split(/\r?\n/)){
   const title=line.match(/^\s*TITLE\s*:\s*(.*)$/i);if(title&&!name)name=title[1].trim();
   const song=line.match(/^\s*SONG(\d+)\s*:\s*(.*)$/i);if(!song)continue;
   const value=song[2].trim();
   const quoted=value.match(/^"((?:[^"]|"")*)"(?:\s*,\s*([0-4]))?$/);
   let ref=value,course;
   if(quoted){ref=quoted[1].replace(/""/g,'"');course=quoted[2]}
   else{const suffix=value.match(/^(.*),\s*([0-4])$/);if(suffix){ref=suffix[1];course=suffix[2]}}
   songs.push({order:Number(song[1]),ref:ref.trim(),course:course===undefined?undefined:Number(course)});
  }
  songs.sort((a,b)=>a.order-b.order);
 }
 return {name,songs};
}
function pickAudio(folder,wave,files){
 const pool=files.filter(x=>isAudio(x.name));
 if(wave){
  const requested=clean(wave).replace(/^(\.\/)+/,'');
  const found=pool.find(x=>clean(x.path).endsWith('/'+requested)||clean(x.name)===clean(base(requested)));
  if(found)return found.path;
 }
 const same=pool.filter(x=>parent(x.path)===folder);
 return same.length===1?same[0].path:pool.length===1?pool[0].path:null;
}
function pickVideo(folder,wanted,files){
 const pool=files.filter(x=>isVideo(x.name));
 if(wanted){
  const found=pool.find(x=>clean(x.name)===clean(base(wanted)));
  if(found)return found.path;
 }
 const same=pool.filter(x=>parent(x.path)===folder);
 return same.length===1?same[0].path:null;
}
function sortRows(a,b){return a.path.localeCompare(b.path,'ja',{numeric:true,sensitivity:'base'})}
function matchingChart(ref,tracks){
 const target=clean(ref).replace(/\.tja$/,'');
 return tracks.find(track=>[track.path,base(track.path),track.title,parent(track.path)+'/'+track.title]
  .some(value=>clean(value).replace(/\.tja$/,'')===target))||
  tracks.find(track=>clean(track.path).endsWith('/'+target+'.tja')||clean(track.title)===clean(ref));
}
export async function onRequestGet({request}){
 const path=new URL(request.url).searchParams.get('path')||'';
 const pieces=path.split('/');
 if(!/^08(?=\D|$)/.test(pieces[0])||pieces.length<2||pieces.length>5||
  path.length>900||pieces.some(p=>!p||p==='.'||p==='..'||p.length>220)||/[\u0000-\u001f\\]/.test(path))
  return fail('ライブフェスティバルのパスが不正です。',400);
 try{
  const first=await list(path),dirs=first.filter(x=>x.type==='dir');
  // Most ESE sets contain TJA files directly; allow one or two levels of song folders as well.
  let nested=await Promise.all(dirs.slice(0,32).map(d=>list(d.path).catch(()=>[])));
  const grand=nested.flat().filter(x=>x.type==='dir');
  if(!first.some(x=>x.type==='file'&&isTja(x.name))&&!nested.flat().some(x=>x.type==='file'&&isTja(x.name))&&grand.length){
   const more=await Promise.all(grand.slice(0,32).map(d=>list(d.path).catch(()=>[])));
   nested.push(...more);
  }
  const all=[...new Map([...first,...nested.flat()].map(x=>[x.path,x])).values()];
  const tjas=all.filter(x=>x.type==='file'&&isTja(x.name)).sort(sortRows).slice(0,40);
  if(!tjas.length)return fail('このコースからTJA譜面を見つけられませんでした。',404);
  const files=all.filter(x=>x.type==='file');
  const manifests=files.filter(x=>/\.(?:dan|json|txt)$/i.test(x.name)&&!/^readme/i.test(x.name))
   .sort((a,b)=>/\.(?:dan|json)$/i.test(a.name)?-1:/\.(?:dan|json)$/i.test(b.name)?1:sortRows(a,b));
  let manifest={name:'',songs:[]};
  for(const item of manifests.slice(0,5)){
   try{const parsed=manifestInfo(await textFile(item.path,256*1024));
    if(parsed.songs.length){manifest=parsed;break}
   }catch{}
  }
  const meta=await Promise.all(tjas.map(async row=>tjaInfo(await textFile(row.path),row.path)));
  // Files containing the same song/different difficulties form one setlist slot.
  const dedup=[];
  for(const track of meta){
   const group=dedup.find(x=>x.title===track.title&&parent(x.path)===parent(track.path)&&!track.segments.length&&!x.segments.length);
   if(group){group.alternates.push(track);continue}
   dedup.push({...track,alternates:[]});
  }
  const ordered=manifest.songs.length?manifest.songs.map(item=>{
   const track=matchingChart(item.ref,dedup)||dedup.find(t=>t.alternates.some(a=>matchingChart(item.ref,[a])));
   return track?{...track,selectedCourse:item.course}:null;
  }).filter(Boolean):dedup;
  if(!ordered.length)return fail('設定ファイルに対応する譜面を見つけられませんでした。',404);
  const songs=ordered.map(track=>{
   const folder=parent(track.path);
   const audio=pickAudio(folder,track.wave,files);
   const segments=track.segments.map((s,i)=>({
    ...s,title:s.title||track.title+' '+(i+2)+'曲目',
    audio:pickAudio(folder,s.wave,files)
   }));
   return {...track,audio,video:pickVideo(folder,track.videoName,files),segments,
    alternates:track.alternates.map(a=>({...a,audio:pickAudio(parent(a.path),a.wave,files),
      video:pickVideo(parent(a.path),a.videoName,files)}))};
  });
  return Response.json({path,name:manifest.name||base(path).replace(/^\d+\s*[-_ ]*/,''),songs,
   source:ORIGIN+'/ESE/ESE'},{headers:{'cache-control':'public, max-age=300'}});
 }catch(e){return fail(e?.name==='AbortError'?'ESEへの接続がタイムアウトしました。':e?.message||'ESEからライブフェスティバルを取得できませんでした。')}
}
