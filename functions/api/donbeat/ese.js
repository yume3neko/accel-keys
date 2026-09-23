// On-demand ESE tree browser and media proxy. No R2 mirroring or bulk import.
const ORIGIN='https://ese.tjadataba.se';
const API=ORIGIN+'/api/v1/repos/ESE/ESE/contents';
const RAW=ORIGIN+'/ESE/ESE/raw/branch/master';
const AUDIO=/\.(?:ogg|mp3|wav|m4a|flac|opus|aac)$/i;
const CHART=/\.tja$/i;
const json=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':status===200?'public, max-age=300':'no-store'}});
function safePath(path){
 if(typeof path!=='string'||path.length>900||/[\u0000-\u001f\\]/.test(path))return null;
 if(!path)return '';
 const parts=path.split('/');
 if(parts.some(part=>!part||part==='.'||part==='..'||part.length>220))return null;
 return parts.join('/');
}
const urlPath=path=>path.split('/').map(encodeURIComponent).join('/');
const filename=path=>path.split('/').pop();
function directoryOf(path){return path.split('/').slice(0,-1).join('/')}
function errorResponse(type,status){return json({error:'ESEの'+type+'を取得できませんでした（HTTP '+status+'）。'},502)}
async function upstream(url,accept='*/*',timeout=18000){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeout);
 try{return await fetch(url,{headers:{accept},signal:ctrl.signal})}
 finally{clearTimeout(timer)}
}
async function entries(path){
 const response=await upstream(API+(path?'/'+urlPath(path):'')+'?ref=master','application/json');
 if(!response.ok)throw Error('フォルダ一覧 HTTP '+response.status);
 const rows=await response.json();
 if(!Array.isArray(rows))throw Error('ESEのフォルダ一覧の形式が不正です。');
 return rows.filter(row=>row&&['dir','file'].includes(row.type)&&typeof row.path==='string'&&typeof row.name==='string');
}
async function tjaBytes(path){
 const response=await upstream(RAW+'/'+urlPath(path));
 if(!response.ok)throw Error('譜面 HTTP '+response.status);
 const max=3*1024*1024;
 if(Number(response.headers.get('content-length'))>max)throw Error('TJAが3 MiBを超えています。');
 const bytes=await response.arrayBuffer();
 if(bytes.byteLength>max)throw Error('TJAが3 MiBを超えています。');
 return bytes;
}
function decodeTja(bytes){
 let utf8;
 try{utf8=new TextDecoder('utf-8',{fatal:true}).decode(bytes)}
 catch{try{utf8=new TextDecoder('shift_jis').decode(bytes)}catch{utf8=new TextDecoder().decode(bytes)}}
 return utf8.replace(/^\uFEFF/,'');
}
function tjaMetadata(text,file){
 const metadata={};
 for(const raw of text.split(/\r?\n/)){
  const line=raw.replace(/\/\/.*$/,'').trim();
  if(/^#START\b/i.test(line))break;
  const m=line.match(/^([A-Z][A-Z0-9]*)\s*:\s*(.*)$/i);
  if(m&&!Object.prototype.hasOwnProperty.call(metadata,m[1].toUpperCase()))metadata[m[1].toUpperCase()]=m[2].trim();
 }
 const title=metadata.TITLEJA||metadata.TITLE||filename(file).replace(/\.tja$/i,'');
 const chartInfo=[...text.matchAll(/^\s*COURSE\s*:\s*(.+)$/gmi)].slice(0,15).map(m=>m[1].trim());
 const levels=[...text.matchAll(/^\s*LEVEL\s*:\s*(.+)$/gmi)].slice(0,15).map(m=>m[1].trim());
 return {title,titleJa:metadata.TITLEJA||'',subtitle:metadata.SUBTITLEJA||metadata.SUBTITLE||'',bpm:metadata.BPM||'',wave:metadata.WAVE||'',charts:chartInfo.map((course,i)=>({course,level:levels[i]||'?'}))};
}
function findAudio(rows,wave){
 const audio=rows.filter(x=>x.type==='file'&&AUDIO.test(x.name));
 if(!audio.length)return null;
 const normalized=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/\\/g,'/').replace(/^(\.\/)+/,'');
 const requested=normalized(wave),base=filename(requested);
 if(requested){
  const exact=audio.find(x=>normalized(x.name)===requested||normalized(x.path).endsWith('/'+requested));
  if(exact)return exact.path;
  const byBase=audio.find(x=>normalized(x.name)===base);
  if(byBase)return byBase.path;
 }
 return audio.length===1?audio[0].path:null;
}
const mediaType=path=>{
 const ext=filename(path).split('.').pop().toLowerCase();
 return ({ogg:'audio/ogg',mp3:'audio/mpeg',wav:'audio/wav',m4a:'audio/mp4',flac:'audio/flac',opus:'audio/ogg',aac:'audio/aac'})[ext]||'application/octet-stream';
};
export async function onRequestGet({request}){
 const url=new URL(request.url),type=url.searchParams.get('type')||'list',path=safePath(url.searchParams.get('path')||'');
 if(path===null)return json({error:'無効なESEパスです。'},400);
 if(!['list','info','chart','audio'].includes(type))return json({error:'不正な取得方法です。'},400);
 if((type==='info'||type==='audio')&&!path)return json({error:'曲フォルダまたは音源が指定されていません。'},400);
 if(type==='chart'&&!CHART.test(path))return json({error:'TJAファイルだけ取得できます。'},400);
 if(type==='audio'&&!AUDIO.test(path))return json({error:'対応する音源ファイルだけ取得できます。'},400);
 try{
  if(type==='list'){
   const rows=await entries(path),insideSong=path.split('/').length>=2;
   const items=rows
    .filter(x=>!x.name.startsWith('.')&&(x.type==='dir'||CHART.test(x.name)||(insideSong&&AUDIO.test(x.name))))
    .map(x=>({name:x.name,path:x.path,type:x.type}))
    .sort((a,b)=>a.type===b.type?a.name.localeCompare(b.name,'ja'):a.type==='dir'?-1:1);
   return json({path,items,source:ORIGIN+'/ESE/ESE'});
  }
  if(type==='info'){
   const chartOnly=CHART.test(path),folder=chartOnly?directoryOf(path):path;
   const rows=await entries(folder);
   const tjas=rows.filter(x=>x.type==='file'&&CHART.test(x.name))
    .sort((a,b)=>a.name.localeCompare(b.name,'ja'));
   const selected=chartOnly?tjas.find(x=>x.path===path):tjas[0];
   if(!selected)return json({error:'曲フォルダにTJAが見つかりませんでした。'},404);
   const metadata=tjaMetadata(decodeTja(await tjaBytes(selected.path)),selected.path);
   const audio=findAudio(rows,metadata.wave);
   return json({...metadata,path:folder,primaryTja:selected.path,tjas:tjas.map(x=>({name:x.name,path:x.path})),audio,audioMissing:!audio});
  }
  if(type==='chart'){
   const bytes=await tjaBytes(path);
   return new Response(bytes,{headers:{'content-type':'application/octet-stream','cache-control':'public, max-age=300','x-content-type-options':'nosniff'}});
  }
  // Media is sent only for the selected song; use a stream to avoid buffering large OGGs.
  const response=await upstream(RAW+'/'+urlPath(path),'audio/*',60000);
  if(!response.ok)return errorResponse('音源',response.status);
  const max=90*1024*1024,declared=Number(response.headers.get('content-length')||0);
  if(declared>max)return json({error:'音源が90 MiBを超えています。'},413);
  const headers=new Headers({
   'content-type':mediaType(path),
   'cache-control':'public, max-age=300',
   'x-content-type-options':'nosniff'
  });
  if(declared>0)headers.set('content-length',String(declared));
  return new Response(response.body,{status:200,headers});
 }catch(e){
  return json({error:e?.name==='AbortError'?'ESEへの接続がタイムアウトしました。':e?.message||'ESEに接続できませんでした。'},502);
 }
}
