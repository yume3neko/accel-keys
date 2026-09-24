import {requireAdmin,checkWriteOrigin} from '../../_shared/donbeat-auth.js';
const json=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});
const validPath=p=>typeof p==='string'&&p.length>0&&p.length<512&&!/[\\\x00-\x1f]/.test(p)&&p.split('/').every(x=>x&&x!=='.'&&x!=='..');
const idOK=id=>/^(?:import-)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id||'');
const allowed=p=>/\.(mc|tja|ogg|mp3|wav|m4a|flac|mp4|webm|m4v|png|jpe?g|webp|gif)$/i.test(p);
const mime=p=>{
 const ext=String(p||'').split('.').pop().toLowerCase();
 return ({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',mp4:'video/mp4',webm:'video/webm',m4v:'video/x-m4v',mp3:'audio/mpeg',ogg:'audio/ogg',wav:'audio/wav',m4a:'audio/mp4',flac:'audio/flac',tja:'text/plain; charset=utf-8',mc:'application/json'})[ext]||'application/octet-stream';
};
const readJSON=async(bucket,key)=>{const f=await bucket.get(key);return f?await f.json():null};
const removePrefix=async(bucket,prefix)=>{let cursor;do{const page=await bucket.list({prefix,cursor});if(page.objects.length)await bucket.delete(page.objects.map(o=>o.key));cursor=page.truncated?page.cursor:undefined}while(cursor)};
const normTitle=s=>String(s||'').normalize('NFC').trim();
const officialTitles=new Set(['BATTLE NO.1','六本の薔薇','六本の薔薇と采の歌','Nivalis','Nivalis*Anima','魔宵月','エンジェルドリーム','銀の黎明','銀の黎明か、黒の晶華か。','銀の黎明か、黒の晶華か','リスドンヴァルナ','リスドンヴァルナの黄昏','らんぶる','らんぶる乱舞'].map(s=>s.normalize('NFKC').toLowerCase().replace(/[\s　・_-]/g,'')));
const songCategory=s=>{
 const explicit=s?.category==='official'||s?.category==='creative'?s.category:null;
 if(s?.categoryManual===true&&explicit)return explicit;
 if(officialTitles.has(String(s?.title||'').normalize('NFKC').toLowerCase().replace(/[\s　・_-]/g,'')))return 'official';
 return explicit||'creative';
};

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
 do{const page=await bucket.list({prefix:'catalog/',cursor});for(const o of page.objects){const data=await readJSON(bucket,o.key);if(!data)continue;const id=o.key.slice('catalog/'.length,-5);(data.songs||[]).forEach((song,index)=>songs.push({id,index,...song,category:songCategory(song)}))}cursor=page.truncated?page.cursor:undefined}while(cursor);
 cursor=undefined;do{const page=await bucket.list({prefix:'dan-catalog/',cursor});for(const o of page.objects){const data=await readJSON(bucket,o.key);if(data)dans.push(data)}cursor=page.truncated?page.cursor:undefined}while(cursor);
 cursor=undefined;do{const page=await bucket.list({prefix:'dan-disabled/',cursor});for(const o of page.objects)disabledStatic.push(o.key.slice('dan-disabled/'.length,-5));cursor=page.truncated?page.cursor:undefined}while(cursor);
 songs.sort((a,b)=>String(a.title).localeCompare(String(b.title),'ja'));dans.sort((a,b)=>String(a.title).localeCompare(String(b.title),'ja'));return {ready:true,songs,dans,disabledStatic};
}

const bulkGenres=['ポップス','アニメ','ボーカロイド','キッズ','バラエティ','クラシック','ゲームミュージック','ナムコオリジナル','その他'];
function normalizeCatalogGenre(value){
 const key=String(value||'').normalize('NFKC').trim().toLowerCase().replace(/[\s　・_\-/]/g,'');
 const aliases=[
  ['ポップス',/^(?:pop|pops|jpop|ポップス|ポップ)$/],
  ['アニメ',/^(?:anime|アニメ)$/],
  ['ボーカロイド',/^(?:vocaloid|ボーカロイド|ボカロ)$/],
  ['キッズ',/^(?:kids|children|キッズ|キッズ民謡|童謡|民謡)$/],
  ['バラエティ',/^(?:variety|バラエティ)$/],
  ['クラシック',/^(?:classic|classical|クラシック)$/],
  ['ゲームミュージック',/^(?:game|gamemusic|ゲーム|ゲームミュージック)$/],
  ['ナムコオリジナル',/^(?:namco|namcooriginal|ナムコ|ナムコオリジナル)$/]
 ];
 return aliases.find(([,test])=>test.test(key))?.[0]||'その他';
}
const genreMatches=(song,genre)=>songCategory(song)==='official'&&normalizeCatalogGenre(song?.genre)===genre;
async function genreCatalogs(bucket,genre){
 // R2 uploads only. Static GitHub catalog entries remain outside this operation.
 const catalogs=[];let cursor;
 do{
  const page=await bucket.list({prefix:'catalog/',cursor,limit:1000});
  for(const item of page.objects){
   if(!/^catalog\/(?:import-)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/i.test(item.key))continue;
   const data=await readJSON(bucket,item.key);
   if(!Array.isArray(data?.songs))continue;
   const match=data.songs.filter(song=>genreMatches(song,genre));
   if(match.length)catalogs.push({key:item.key,data,match});
  }
  cursor=page.truncated?page.cursor:undefined;
 }while(cursor);
 catalogs.sort((a,b)=>a.key.localeCompare(b.key));
 return catalogs;
}
function genreCount(catalogs){return catalogs.reduce((sum,item)=>sum+item.match.length,0)}
async function genreToken(genre,catalogs){
 // A stale preview cannot authorize deletion if even one target catalog changed.
 const contents=JSON.stringify([genre,...catalogs.map(item=>[item.key,item.data.songs])]);
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(contents));
 return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}
async function clearPublishedBatch(bucket,key){
 const id=key.slice('catalog/'.length,-5);
 const prefix=id.startsWith('import-')?'uploads/'+id.slice('import-'.length)+'/':'files/'+id+'/';
 // Always read the first page afresh: deleting objects during cursor pagination
 // can otherwise skip objects when a batch has more than 1000 files.
 for(let round=0;round<20;round++){
  const page=await bucket.list({prefix,limit:1000});
  if(!page.objects.length)break;
  await bucket.delete(page.objects.map(item=>item.key));
  if(!page.truncated)break;
 }
 if(id.startsWith('import-'))await bucket.delete('pending/'+id.slice('import-'.length)+'.json');
}

export async function onRequest({request,env}){
 const blocked=await requireAdmin(request,env)||(request.method==='GET'?null:checkWriteOrigin(request));if(blocked)return blocked;
 if(!env.DONBEAT_BUCKET)return json({error:'保存先が未設定です。CloudflareでR2バケットをDONBEAT_BUCKETとして接続し、再デプロイしてください。'},503);
 const bucket=env.DONBEAT_BUCKET,url=new URL(request.url),id=url.searchParams.get('id'),action=url.searchParams.get('action')||'';
 try{
  if(request.method==='GET'){
   if(action==='genre-delete'){
    const genre=url.searchParams.get('genre');
    if(!bulkGenres.includes(genre))return json({error:'削除対象のジャンルを指定してください。'},400);
    const catalogs=await genreCatalogs(bucket,genre),count=genreCount(catalogs);
    return json({genre,count,catalogCount:catalogs.length,
     titles:catalogs.flatMap(item=>item.match.map(song=>song.title)).slice(0,12),
     token:await genreToken(genre,catalogs),scope:'official-r2'});
   }
   if(action==='dan'){
    if(!idOK(id)||id.startsWith('import-'))return json({error:'段位IDが不正です。'},400);
    const [info,source]=await Promise.all([readJSON(bucket,'dan-catalog/'+id+'.json'),bucket.get('dan/'+id+'.dan')]);
    return info&&source?json({id,title:info.title,content:await source.text()}):json({error:'段位が見つかりません。'},404);
   }
   if(action)return json({error:'取得操作が不正です。'},400);
   return json(await listAdmin(bucket));
  }
  if(action==='song'&&request.method==='PATCH'){
   if(!idOK(id))return json({error:'アップロードIDが不正です。'},400);
   if(!url.searchParams.has('index'))return json({error:'対象の曲が指定されていません。'},400);
   const index=Number(url.searchParams.get('index')),key='catalog/'+id+'.json',data=await readJSON(bucket,key);
   if(!data||!Array.isArray(data.songs)||!Number.isInteger(index)||index<0||index>=data.songs.length)return json({error:'対象の曲が見つかりません。'},404);
   const raw=await request.text();if(raw.length>1000)return json({error:'分類指定が大きすぎます。'},413);
   const body=JSON.parse(raw),song=data.songs[index];
   if(!Object.hasOwn(body,'category')&&!Object.hasOwn(body,'genre'))return json({error:'変更内容を指定してください。'},400);
   if(Object.hasOwn(body,'category')){
    if(body.category!=='official'&&body.category!=='creative')return json({error:'譜面分類が不正です。'},400);
    song.category=body.category;song.categoryManual=true;
   }
   if(Object.hasOwn(body,'genre')){
    if(!['ポップス','アニメ','ボーカロイド','キッズ','バラエティ','クラシック','ゲームミュージック','ナムコオリジナル','その他'].includes(body.genre))
     return json({error:'ジャンルが不正です。'},400);
    song.genre=body.genre;
   }
   await bucket.put(key,JSON.stringify(data),{httpMetadata:{contentType:'application/json'}});
   return json({ok:true,category:song.category,genre:song.genre||'その他'});
  }
  if(action==='genre-delete'&&request.method==='DELETE'){
   const genre=url.searchParams.get('genre');
   if(!bulkGenres.includes(genre))return json({error:'削除対象のジャンルを指定してください。'},400);
   const raw=await request.text();
   if(raw.length>1024)return json({error:'確認情報が大きすぎます。'},413);
   const body=JSON.parse(raw);
   if(body?.confirm!==genre||!(/^[0-9a-f]{64}$/i.test(body?.token||'')))
    return json({error:'削除の確認が完了していません。'},400);
   const catalogs=await genreCatalogs(bucket,genre),before=genreCount(catalogs);
   if(body.token!==await genreToken(genre,catalogs))
    return json({error:'確認後に対象曲が変更されました。最新の曲数を再確認してください。'},409);
   if(before===0)return json({deleted:0,remaining:0,completed:true,token:body.token});
   let deleted=0;const warnings=[];
   // Limit each invocation so large libraries can be cleared in repeatable batches.
   for(const item of catalogs.slice(0,8)){
    const keep=item.data.songs.filter(song=>!genreMatches(song,genre));
    deleted+=item.data.songs.length-keep.length;
    item.data.songs=keep;item.match=[];
    if(keep.length){
     // Keep a multi-genre upload's shared audio and other assets intact.
     await bucket.put(item.key,JSON.stringify(item.data),{httpMetadata:{contentType:'application/json'}});
    }else{
     // Unpublish first, then reclaim the now-unreferenced upload folder.
     await bucket.delete(item.key);
     try{await clearPublishedBatch(bucket,item.key)}
     catch(e){warnings.push('削除済みの曲の素材を整理できませんでした：'+item.key)}
    }
   }
   const remaining=before-deleted;
   return json({deleted,remaining,completed:remaining===0,
    token:await genreToken(genre,catalogs.filter(item=>item.data.songs.some(song=>genreMatches(song,genre)))),
    warnings});
  }
  if(action==='song'&&request.method==='DELETE'){
   if(!idOK(id))return json({error:'アップロードIDが不正です。'},400);const index=Number(url.searchParams.get('index'));const key='catalog/'+id+'.json',data=await readJSON(bucket,key);if(!data||!Array.isArray(data.songs)||!Number.isInteger(index)||index<0||index>=data.songs.length)return json({error:'対象の曲が見つかりません。'},404);
   const [removed]=data.songs.splice(index,1);if(data.songs.length)await bucket.put(key,JSON.stringify(data),{httpMetadata:{contentType:'application/json'}});else{await bucket.delete(key);if(id.startsWith('import-')){const batch=id.slice(7);await removePrefix(bucket,'uploads/'+batch+'/');await bucket.delete('pending/'+batch+'.json')}else await removePrefix(bucket,'files/'+id+'/')};return json({ok:true,removed:removed?.title||''});
  }
  if(action==='dan'&&request.method==='POST'){
   if(!idOK(id)||id.startsWith('import-'))return json({error:'段位IDが不正です。'},400);const raw=await request.text();if(raw.length>120000)return json({error:'段位設定が大きすぎます。'},413);const body=JSON.parse(raw),title=String(body.title||'').trim(),content=String(body.content||'');if(!title||title.length>300||!content.trim())return json({error:'段位名または設定内容が不正です。'},400);if(!/^\s*(?:TITLE\s*:|SONG1\s*:)/mi.test(content)||!/^\s*SONG1\s*:/mi.test(content))return json({error:'段位設定ファイルとして認識できません。'},400);
   await validateDanSongs(bucket,content);
   const file='/api/donbeat/dan/'+id;await bucket.put('dan/'+id+'.dan',content,{httpMetadata:{contentType:'text/plain; charset=utf-8'}});await bucket.put('dan-catalog/'+id+'.json',JSON.stringify({id,title,file}),{httpMetadata:{contentType:'application/json'}});await bucket.delete('dan-disabled/'+id+'.json');return json({ok:true,id,title,file});
  }
  if(action==='dan'&&request.method==='DELETE'){
   if(!idOK(id)||id.startsWith('import-'))return json({error:'段位IDが不正です。'},400);await bucket.delete(['dan-catalog/'+id+'.json','dan/'+id+'.dan']);return json({ok:true});
  }
  if(action==='dan-static'&&(request.method==='POST'||request.method==='DELETE')){
   const key=String(url.searchParams.get('key')||'');if(!/^[a-z0-9][a-z0-9_-]{0,80}$/i.test(key))return json({error:'段位キーが不正です。'},400);if(request.method==='DELETE')await bucket.put('dan-disabled/'+key+'.json',JSON.stringify({key,disabled:true}),{httpMetadata:{contentType:'application/json'}});else await bucket.delete('dan-disabled/'+key+'.json');return json({ok:true});
  }
  return json({error:'この管理画面では未検証ファイルを公開できません。管理者アップロード機能をご利用ください。'},405);
 }catch(e){return json({error:e.message||'保存できませんでした。'},400)}
}
