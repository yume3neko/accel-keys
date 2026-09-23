// On-demand TJA browser for the upstream ESE repository.
// No songs or audio files are mirrored into DON BEAT or the site's R2 bucket.
const ORIGIN='https://ese.tjadataba.se';
const API=ORIGIN+'/api/v1/repos/ESE/ESE/contents';
const RAW=ORIGIN+'/ESE/ESE/raw/branch/master';
const json=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':status===200?'public, max-age=300':'no-store'}});
function safePath(p){
 if(typeof p!=='string'||p.length>700||/[\u0000-\u001f\\]/.test(p))return null;
 if(!p)return '';
 const parts=p.split('/');
 if(parts.some(x=>!x||x==='.'||x==='..'||x.length>180))return null;
 return parts.join('/');
}
const urlPath=p=>p.split('/').map(encodeURIComponent).join('/');
async function upstream(url){
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),15000);
 try{return await fetch(url,{headers:{accept:'application/json'},signal:abort.signal})}
 finally{clearTimeout(timer)}
}
export async function onRequestGet({request}){
 const u=new URL(request.url),type=u.searchParams.get('type')||'list',path=safePath(u.searchParams.get('path')||'');
 if(path===null)return json({error:'無効なESEパスです。'},400);
 if(type!=='list'&&type!=='chart')return json({error:'無効な取得方法です。'},400);
 if(type==='chart'&&!/\.tja$/i.test(path))return json({error:'TJAのみ取得できます。'},400);
 try{
  if(type==='list'){
   const url=API+(path?'/'+urlPath(path):'')+'?ref=master';
   const response=await upstream(url);
   if(!response.ok)return json({error:'ESEのフォルダを取得できませんでした。 HTTP '+response.status},502);
   const raw=await response.json();
   if(!Array.isArray(raw))return json({error:'ESEのフォルダ一覧の形式が想定外です。'},502);
   const items=raw.filter(x=>x&&['dir','file'].includes(x.type)&&typeof x.path==='string')
    .filter(x=>x.type==='dir'||/\.tja$/i.test(x.name||''))
    .filter(x=>!String(x.name||'').startsWith('.'))
    .map(x=>({name:x.name,path:x.path,type:x.type}))
    .sort((a,b)=>a.type===b.type?a.name.localeCompare(b.name,'ja'):a.type==='dir'?-1:1);
   return json({path,items,source:ORIGIN+'/ESE/ESE'});
  }
  const response=await upstream(RAW+'/'+urlPath(path));
  if(!response.ok)return json({error:'ESEのTJAを取得できませんでした。 HTTP '+response.status},502);
  const max=3*1024*1024;
  if(Number(response.headers.get('content-length'))>max)return json({error:'譜面が大きすぎます。'},413);
  const content=await response.arrayBuffer();
  if(content.byteLength>max)return json({error:'譜面が大きすぎます。'},413);
  return new Response(content,{headers:{'content-type':'application/octet-stream','cache-control':'public, max-age=300','x-content-type-options':'nosniff'}});
 }catch(e){return json({error:e?.name==='AbortError'?'ESEへの接続がタイムアウトしました。':'ESEに接続できませんでした。'},502)}
}
