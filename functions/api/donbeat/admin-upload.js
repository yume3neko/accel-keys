// DONBEAT R2 imports: all files must arrive and every TJA/MC must resolve its BGM
// before the catalog is written. The catalog object is the only publication marker.
const CHART=/\.(tja|mc)$/i, AUDIO=/\.(ogg|mp3|wav|m4a|flac|opus|aac)$/i;
const ALLOWED=/\.(tja|mc|ogg|mp3|wav|m4a|flac|opus|aac|mp4|webm|m4v|png|jpg|jpeg|webp|gif)$/i;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_FILES=1200, MAX_FILE=90*1024*1024, MAX_CHART=8*1024*1024, MAX_TOTAL=4*1024*1024*1024;
const GENRES=['ポップス','アニメ','ボーカロイド','キッズ','バラエティ','クラシック','ゲームミュージック','ナムコオリジナル'];
const MIME={tja:'text/plain; charset=utf-8',mc:'application/json',ogg:'audio/ogg',mp3:'audio/mpeg',wav:'audio/wav',m4a:'audio/mp4',flac:'audio/flac',opus:'audio/ogg',aac:'audio/aac',mp4:'video/mp4',webm:'video/webm',m4v:'video/mp4',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif'};
const json=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});
const bad=(error,status=400,details)=>json({error,...(details?{details}:{})},status);
const manifestKey=id=>'pending/'+id+'.json', catalogKey=id=>'catalog/import-'+id+'.json';
const objectKey=(id,path)=>'uploads/'+id+'/'+path;
const norm=s=>String(s||'').normalize('NFC').toLowerCase();
function filePath(path){
 if(typeof path!=='string'||path.length>700||path.startsWith('/')||path.includes('\\'))throw Error('ファイルパスが不正です。');
 const seg=path.normalize('NFC').split('/');
 if(seg.some(s=>!s||s==='.'||s==='..'||s.length>180||/[\u0000-\u001f\u007f]/.test(s)))throw Error('フォルダ名・ファイル名が不正です: '+path);
 const clean=seg.join('/');
 if(!ALLOWED.test(clean))throw Error('対応していないファイル形式です: '+path);
 return clean;
}
function genreOf(raw){
 const s=String(raw||'').normalize('NFKC').trim().toLowerCase().replace(/[\s　・_\-/]/g,'');
 const aliases=[
  ['ポップス',/^(?:pop|pops|jpop|ポップス|ポップ)$/],
  ['アニメ',/^(?:anime|アニメ)$/],
  ['ボーカロイド',/^(?:vocaloid|ボカロ|ボーカロイド)$/],
  ['キッズ',/^(?:kids|children|キッズ|キッズ民謡|童謡|民謡)$/],
  ['バラエティ',/^(?:variety|バラエティ)$/],
  ['クラシック',/^(?:classical|classic|クラシック)$/],
  ['ゲームミュージック',/^(?:game|gamemusic|ゲーム|ゲームミュージック)$/],
  ['ナムコオリジナル',/^(?:namco|namcooriginal|ナムコ|ナムコオリジナル)$/]
 ];
 return aliases.find(([,re])=>re.test(s))?.[0]||null;
}
function inferGenre(path,override,embedded){
 // Accept either ジャンル/曲名/... or 任意の親/ジャンル/曲名/...
 return path.split('/').slice(0,3).map(genreOf).find(Boolean)||genreOf(override)||genreOf(embedded)||'その他';
}
function resolvePath(from,target){
 if(typeof target!=='string'||!target.trim()||/^(?:[a-z]+:|\/)/i.test(target))return null;
 const path=from.split('/').slice(0,-1);
 for(const segment of target.normalize('NFC').replace(/\\/g,'/').split('/')){
  if(!segment||segment==='.')continue;
  if(segment==='..'){if(!path.length)return null;path.pop()}
  else if(/[\u0000-\u001f]/.test(segment))return null;
  else path.push(segment);
 }
 return path.join('/');
}
function textFrom(bytes){
 try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^\uFEFF/,'')}
 catch{return new TextDecoder('shift-jis').decode(bytes).replace(/^\uFEFF/,'')}
}
function parseChart(text,path){
 if(/\.mc$/i.test(path)){
  const d=JSON.parse(text);
  if(Number(d.meta?.mode)!==5||!Array.isArray(d.note)||!Array.isArray(d.time)||!d.time.length)
   throw Error('Malody太鼓モード（mode:5）の譜面ではありません。');
  const bgms=[...new Set(d.note.filter(n=>Number(n.type)===1&&typeof n.sound==='string'&&n.sound.trim()).map(n=>n.sound.trim()))];
  if(!d.note.some(n=>n.sound===undefined&&Number.isFinite(Number(n.style))))throw Error('演奏できる音符がありません。');
  return {title:String(d.meta?.song?.titleorg||d.meta?.song?.title||path.split('/').pop().replace(/\.mc$/i,'')).trim(),waves:bgms,genre:d.meta?.genre||''};
 }
 const meta={},waves=[],lines=text.split(/\r?\n/);
 let started=false,hasNotes=false,hasSingle=false,activeStyle='';
 for(const raw of lines){
  const line=raw.replace(/\/\/.*$/,'').trim();
  if(!line)continue;
  if(/^STYLE\s*:/i.test(line))activeStyle=line.split(':').slice(1).join(':').trim().toUpperCase();
  if(/^#START\b/i.test(line)){started=true;if(activeStyle!=='DOUBLE')hasSingle=true;continue}
  if(/^#END\b/i.test(line)){started=false;continue}
  if(!started){
   const m=line.match(/^([a-z0-9]+)\s*:\s*(.*?)\s*$/i);
   if(m){const key=m[1].toUpperCase();if(!(key in meta))meta[key]=m[2];
    if(key==='WAVE'&&m[2])waves.push(m[2]);}
  }else if(!line.startsWith('#')&&activeStyle!=='DOUBLE'&&/[1-7]/.test(line.replace(/,.*$/,'')))hasNotes=true;
 }
 if(!hasSingle||!hasNotes)throw Error('演奏できる1人用の音符がありません。');
 const unique=[...new Set(waves.map(norm))];
 if(unique.length>1)throw Error('1つのTJAに複数の異なるWAVEがあります。譜面ごとに分けてください。');
 return {title:String(meta.TITLEJA||meta.TITLE||path.split('/').pop().replace(/\.tja$/i,'')).trim(),waves:waves.slice(0,1),genre:meta.GENRE||''};
}
async function authorized(request,env){
 if(typeof env.DONBEAT_ADMIN_TOKEN!=='string'||env.DONBEAT_ADMIN_TOKEN.length<16)return {error:bad('管理者用シークレット DONBEAT_ADMIN_TOKEN が未設定です。',503)};
 const supplied=request.headers.get('authorization')||'';
 if(!supplied.startsWith('Bearer ')||supplied.length>4000)return {error:bad('管理者認証が必要です。',401)};
 const digest=async value=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
 const [a,b]=await Promise.all([digest(supplied.slice(7)),digest(env.DONBEAT_ADMIN_TOKEN)]);
 let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
 return diff?{error:bad('管理者トークンが正しくありません。',401)}:{};
}
async function readManifest(bucket,id){
 const item=await bucket.get(manifestKey(id));
 return item?item.json():null;
}
async function stagedObjects(bucket,id){
 const output=new Map();let cursor;
 do{
  const list=await bucket.list({prefix:'uploads/'+id+'/',cursor,limit:1000});
  for(const obj of list.objects)output.set(obj.key.slice(('uploads/'+id+'/').length),obj);
  cursor=list.truncated?list.cursor:null;
 }while(cursor);
 return output;
}
function findAudio(chart,wave,objects){
 const audio=[...objects.keys()].filter(path=>AUDIO.test(path));
 const resolved=wave?resolvePath(chart,wave):null;
 if(wave){
  if(!resolved)return null;
  // Case-insensitive matching helps Windows-authored TJAs.
  return audio.find(path=>norm(path)===norm(resolved))||null;
 }
 const dir=chart.split('/').slice(0,-1).join('/');
 const sameDir=audio.filter(path=>path.split('/').slice(0,-1).join('/')===dir);
 const stem=chart.split('/').pop().replace(/\.(?:tja|mc)$/i,'');
 const sameName=sameDir.find(path=>norm(path.split('/').pop().replace(AUDIO,''))===norm(stem));
 return sameName||(sameDir.length===1?sameDir[0]:null);
}
function mediaURL(id,path){
 return '/api/donbeat/media?batch='+encodeURIComponent(id)+'&path='+encodeURIComponent(path);
}
export async function onRequestPost({request,env}){
 const auth=await authorized(request,env);if(auth.error)return auth.error;
 const bucket=env.DONBEAT_BUCKET;if(!bucket)return bad('R2のDONBEAT_BUCKETが設定されていません。',503);
 if(Number(request.headers.get('content-length'))>250000)return bad('リクエストが大きすぎます。',413);
 let body;try{body=await request.json()}catch{return bad('JSONの形式が不正です。')}
 if(body?.action==='begin'){
  if(!Array.isArray(body.files)||!body.files.length||body.files.length>MAX_FILES)return bad('ファイル数は1～'+MAX_FILES+'個にしてください。');
  const files=[],seen=new Set();let total=0;
  try{
   for(const item of body.files){
    const path=filePath(item.path),size=Number(item.size);
    if(!Number.isSafeInteger(size)||size<1||size>MAX_FILE)throw Error(path+' のサイズが不正です（1ファイル90MBまで）。');
    if(CHART.test(path)&&size>MAX_CHART)throw Error(path+'：譜面は8MB以下にしてください。');
    if(seen.has(norm(path)))throw Error('同じファイルパスが重複しています: '+path);
    seen.add(norm(path));total+=size;files.push({path,size});
   }
   if(total>MAX_TOTAL)throw Error('一括アップロードは合計4GB以下にしてください。');
   if(!files.some(f=>CHART.test(f.path)))throw Error('TJAまたはMC譜面を含めてください。');
  }catch(e){return bad(e.message)}
  const id=crypto.randomUUID();
  const manifest={id,files,genre:GENRES.includes(body.genre)?body.genre:null,createdAt:new Date().toISOString()};
  await bucket.put(manifestKey(id),JSON.stringify(manifest),{httpMetadata:{contentType:'application/json'}});
  return json({batch:id,count:files.length,total});
 }
 if(body?.action!=='publish')return bad('不明な操作です。');
 const id=body.batch;
 if(!UUID.test(id||''))return bad('アップロードIDが不正です。');
 const manifest=await readManifest(bucket,id);
 if(!manifest)return bad('アップロードを開始していません。',404);
 if(await bucket.head(catalogKey(id)))return json({published:true,alreadyPublished:true});
 const objects=await stagedObjects(bucket,id),expected=new Set(manifest.files.map(f=>f.path));
 const incomplete=manifest.files.filter(f=>objects.get(f.path)?.size!==f.size).map(f=>f.path);
 if(incomplete.length)return bad('まだすべてのファイルのアップロードが完了していません。',409,incomplete.slice(0,100));
 const unexpected=[...objects.keys()].filter(path=>!expected.has(path));
 if(unexpected.length)return bad('登録されていないファイルが含まれています。',409,unexpected.slice(0,100));
 const charts=manifest.files.filter(f=>CHART.test(f.path)),issues=[],songs=[];
 for(const f of charts){
  let metadata;
  try{
   const obj=await bucket.get(objectKey(id,f.path));
   if(!obj||obj.size!==f.size)throw Error('譜面が見つかりません。');
   metadata=parseChart(textFrom(await obj.arrayBuffer()),f.path);
  }catch(e){issues.push(f.path+'：'+(e.message||String(e)));continue}
  const matches=metadata.waves.length?metadata.waves.map(w=>({wave:w,path:findAudio(f.path,w,objects)})):[{wave:'',path:findAudio(f.path,'',objects)}];
  for(const m of matches)if(!m.path||objects.get(m.path)?.size===0)issues.push(f.path+'：音源が見つかりません '+(m.wave||'（WAVE未指定・音源を特定できません）'));
  if(matches.some(m=>!m.path||objects.get(m.path)?.size===0))continue;
  const audio=matches[0].path;
  const genre=inferGenre(f.path,manifest.genre,metadata.genre);
  songs.push({title:metadata.title||f.path.split('/').pop(),file:mediaURL(id,f.path),
   audio:mediaURL(id,audio),genre,category:'official',categoryManual:true});
 }
 if(issues.length)return bad('譜面と音源がすべてそろっていないため公開しませんでした。',409,issues.slice(0,100));
 // Single manifest write makes the fully uploaded batch visible at once.
 await bucket.put(catalogKey(id),JSON.stringify({songs,publishedAt:new Date().toISOString(),batch:id}),{httpMetadata:{contentType:'application/json'}});
 return json({published:true,songCount:songs.length,genres:[...new Set(songs.map(s=>s.genre))]});
}
export async function onRequestPut({request,env}){
 const auth=await authorized(request,env);if(auth.error)return auth.error;
 const bucket=env.DONBEAT_BUCKET;if(!bucket)return bad('R2が設定されていません。',503);
 const params=new URL(request.url).searchParams,id=params.get('batch'),raw=params.get('path');
 if(!UUID.test(id||''))return bad('アップロードIDが不正です。');
 let path;try{path=filePath(raw)}catch(e){return bad(e.message)}
 const manifest=await readManifest(bucket,id);
 if(!manifest)return bad('アップロード情報が見つかりません。',404);
 if(await bucket.head(catalogKey(id)))return bad('公開済みのファイルは変更できません。',409);
 const expected=manifest.files.find(f=>f.path===path);
 if(!expected)return bad('事前登録されていないファイルです。',400);
 const n=Number(request.headers.get('content-length'));
 if(Number.isFinite(n)&&n>0&&n!==expected.size)return bad('ファイルサイズが登録内容と一致しません。',400);
 if(!request.body)return bad('ファイルが空です。');
 const ext=path.split('.').pop().toLowerCase();
 const obj=await bucket.put(objectKey(id,path),request.body,{httpMetadata:{contentType:MIME[ext]||'application/octet-stream'}});
 if(!obj||obj.size!==expected.size){await bucket.delete(objectKey(id,path));return bad('ファイルのサイズが一致しません。再アップロードしてください。',400)}
 return json({uploaded:true,path,size:obj.size});
}