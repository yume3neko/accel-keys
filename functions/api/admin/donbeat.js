const json=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});
export const validPath=p=>typeof p==='string'&&p.length>0&&p.length<512&&!/[\\\x00-\x1f]/.test(p)&&p.split('/').every(x=>x&&x!=='.'&&x!=='..');
const idOK=id=>/^[a-f0-9-]{36}$/.test(id||'');
const allowed=p=>/\.(mc|tja|ogg|mp3|wav|m4a|flac|mp4|webm|m4v)$/i.test(p);
const readJSON=async(bucket,key)=>{const f=await bucket.get(key);return f?await f.json():null};
const removePrefix=async(bucket,prefix)=>{let cursor;do{const page=await bucket.list({prefix,cursor});if(page.objects.length)await bucket.delete(page.objects.map(o=>o.key));cursor=page.truncated?page.cursor:undefined}while(cursor)};
const normTitle=s=>String(s||'').normalize('NFC').trim();
async function publishedSongTitles(bucket){const titles=new Set();let cursor;do{const page=await bucket.list({prefix:'catalog/',cursor});for(const o of page.objects){const data=await readJSON(bucket,o.key);for(const song of data?.songs||[])if(song?.title)titles.add(normTitle(song.title))}cursor=page.truncated?page.cursor:undefined}while(cursor);return titles}
function danSongNames(content){
 const found=[];
 for(const raw of String(content).replace(/^\uFEFF/,'').split(/\r?\n/)){
  const line=raw.trim();if(!line||line.startsWith('//'))continue;
  const m=line.match(/^SONG(\d+)\s*:\s*(.+)$/i);if(!m)continue;
  const index=Number(m[1]),value=m[2].trim();let name='';
  if(value.startsWith('"')){const q=value.match(/^"((?:[^"]|"")*)"(?:\s*,\s*[0-4])?\s*$/);if(!q)throw Error('SONG'+index+' の曲名または難易度指定が不正です。');name=q[1].replace(/""/g,'"').trim()}
  else{const d=value.match(/^(.*?)(?:\s*,\s*([0-4]))?\s*$/);name=(d?.[1]||'').trim()}
  if(!name)throw Error('SONG'+index+' の曲名が空です。');found.push({index,name:normTitle(name)});
 }
 found.sort((a,b)=>a.index-b.index);if(!found.length||found.some((x,i)=>x.index!==i+1))throw Error('SONGは1から連番で指定してください。');return found.map(x=>x.name);
}
async function validateDanSongs(bucket,content){const available=await publishedSongTitles(bucket),missing=[...new Set(danSongNames(content).filter(name=>!available.has(name)))];if(missing.length)throw Error('未収録曲を含むため段位を登録できません：'+missing.join('、'));}
async function listAdmin(bucket){
 const songs=[],dans=[],disabledStatic=[];let cursor;
 do{const page=await bucket.list({prefix:'catalog/',cursor});for(const o of page.objects){const data=await readJSON(bucket,o.key);if(!data)continue;const id=o.key.slice('catalog/'.length,-5);(data.songs||[]).forEach((song,index)=>songs.push({id,index,...song}))}cursor=page.truncated?page.cursor:undefined}while(cursor);
 cursor=undefined;do{const page=await bucket.list({prefix:'dan-catalog/',cursor});for(const o of page.objects){const data=await readJSON(bucket,o.key);if(data)dans.push(data)}cursor=page.truncated?page.cursor:undefined}while(cursor);
 cursor=undefined;do{const page=await bucket.list({prefix:'dan-disabled/',cursor});for(const o of page.objects)disabledStatic.push(o.key.slice('dan-disabled/'.length,-5));cursor=page.truncated?page.cursor:undefined}while(cursor);
 songs.sort((a,b)=>String(a.title).localeCompare(String(b.title),'ja'));dans.sort((a,b)=>String(a.title).localeCompare(String(b.title),'ja'));return {ready:true,songs,dans,disabledStatic};
}
export async function onRequest({request,env}){
 if(!env.ADMIN_TOKEN||request.headers.get('authorization')!=='Bearer '+env.ADMIN_TOKEN)return json({error:'管理者キーが正しくありません。'},401);
 if(!env.DONBEAT_BUCKET)return json({error:'保存先が未設定です。CloudflareでR2バケットをDONBEAT_BUCKETとして接続し、再デプロイしてください。'},503);
 const bucket=env.DONBEAT_BUCKET,url=new URL(request.url),id=url.searchParams.get('id'),action=url.searchParams.get('action')||'';
 try{
  if(request.method==='GET')return json(await listAdmin(bucket));
  if(action==='song'&&request.method==='DELETE'){
   if(!idOK(id))return json({error:'アップロードIDが不正です。'},400);const index=Number(url.searchParams.get('index'));const key='catalog/'+id+'.json',data=await readJSON(bucket,key);if(!data||!Array.isArray(data.songs)||!Number.isInteger(index)||index<0||index>=data.songs.length)return json({error:'対象の曲が見つかりません。'},404);
   const [removed]=data.songs.splice(index,1);if(data.songs.length)await bucket.put(key,JSON.stringify(data),{httpMetadata:{contentType:'application/json'}});else{await bucket.delete(key);await removePrefix(bucket,'files/'+id+'/')};return json({ok:true,removed:removed?.title||''});
  }
  if(action==='dan'&&request.method==='POST'){
   if(!idOK(id))return json({error:'段位IDが不正です。'},400);const raw=await request.text();if(raw.length>120000)return json({error:'段位設定が大きすぎます。'},413);const body=JSON.parse(raw),title=String(body.title||'').trim(),content=String(body.content||'');if(!title||title.length>300||!content.trim())return json({error:'段位名または設定内容が不正です。'},400);if(!/^\s*(?:TITLE\s*:|SONG1\s*:)/mi.test(content)||!/^\s*SONG1\s*:/mi.test(content))return json({error:'段位設定ファイルとして認識できません。'},400);
   await validateDanSongs(bucket,content);
   const file='/api/donbeat/dan/'+id;await bucket.put('dan/'+id+'.dan',content,{httpMetadata:{contentType:'text/plain; charset=utf-8'}});await bucket.put('dan-catalog/'+id+'.json',JSON.stringify({id,title,file}),{httpMetadata:{contentType:'application/json'}});await bucket.delete('dan-disabled/'+id+'.json');return json({ok:true,id,title,file});
  }
  if(action==='dan'&&request.method==='DELETE'){
   if(!idOK(id))return json({error:'段位IDが不正です。'},400);await bucket.delete(['dan-catalog/'+id+'.json','dan/'+id+'.dan']);return json({ok:true});
  }
  if(action==='dan-static'&&request.method==='DELETE'){
   const key=String(url.searchParams.get('key')||'');if(!/^[a-z0-9][a-z0-9_-]{0,80}$/i.test(key))return json({error:'段位キーが不正です。'},400);await bucket.put('dan-disabled/'+key+'.json',JSON.stringify({key,disabled:true}),{httpMetadata:{contentType:'application/json'}});return json({ok:true});
  }
  if(!idOK(id))return json({error:'アップロードIDが不正です。'},400);
  const prefix='files/'+id+'/',catalogKey='catalog/'+id+'.json';
  if(request.method==='DELETE'){
   await bucket.delete(catalogKey);await removePrefix(bucket,prefix);return json({ok:true});
  }
  if(await bucket.head(catalogKey))return json({error:'公開済みのアップロードです。'},409);
  if(request.method==='PUT'){
   const path=url.searchParams.get('path');if(!validPath(path)||!allowed(path))return json({error:'ファイル名・拡張子が不正です。'},400);
   const size=Number(request.headers.get('content-length'));if(!Number.isSafeInteger(size)||size<=0||size>90*1024*1024)return json({error:'1ファイルは90MiB以下にしてください。'},413);
   await bucket.put(prefix+path,request.body,{httpMetadata:{contentType:'application/octet-stream'}});return json({ok:true});
  }
  if(request.method==='POST'){
   const raw=await request.text();if(raw.length>100000)return json({error:'曲一覧が大きすぎます。'},413);
   const {songs}=JSON.parse(raw);if(!Array.isArray(songs)||!songs.length||songs.length>200)return json({error:'1回に1〜200曲を指定してください。'},400);
   const output=[],needed=new Set();const asset=p=>'/api/donbeat/files/'+id+'/'+p.split('/').map(encodeURIComponent).join('/');
   for(const s of songs){
    if(typeof s.title!=='string'||!s.title.trim()||s.title.length>300||!validPath(s.chartPath)||!/\.(mc|tja)$/i.test(s.chartPath)||!validPath(s.audioPath)||!/\.(ogg|mp3|wav|m4a|flac)$/i.test(s.audioPath))throw Error('譜面・音源の指定が不正です。');
    const entry={title:s.title,file:asset(s.chartPath),audio:asset(s.audioPath),features:{}};
    for(const k of ['soflan','scrollOnNotes','scrollStop','reverseScroll','fadeOnNotes','branch','dummy','damage','fadeout','mv','hbscroll'])entry.features[k]=s.features?.[k]===true;
    needed.add(s.chartPath);needed.add(s.audioPath);
    if(s.videoPath){if(!validPath(s.videoPath)||!/\.(mp4|webm|m4v)$/i.test(s.videoPath))throw Error('動画の指定が不正です。');entry.video=asset(s.videoPath);entry.features.mv=true;needed.add(s.videoPath)}
    output.push(entry);
   }
   for(const p of needed)if(!await bucket.head(prefix+p))throw Error('未保存のファイル：'+p);
   await bucket.put(catalogKey,JSON.stringify({songs:output}),{httpMetadata:{contentType:'application/json'}});return json({ok:true,count:output.length});
  }
  return json({error:'対応していない操作です。'},405);
 }catch(e){return json({error:e.message||'保存できませんでした。'},400)}
}
