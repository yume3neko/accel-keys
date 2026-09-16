const json=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});
export const validPath=p=>typeof p==='string'&&p.length>0&&p.length<512&&!/[\\\x00-\x1f]/.test(p)&&p.split('/').every(x=>x&&x!=='.'&&x!=='..');
const idOK=id=>/^[a-f0-9-]{36}$/.test(id||'');
const allowed=p=>/\.(mc|tja|ogg|mp3|wav|m4a|flac|mp4|webm|m4v)$/i.test(p);
export async function onRequest({request,env}){
 if(!env.ADMIN_TOKEN||request.headers.get('authorization')!=='Bearer '+env.ADMIN_TOKEN)return json({error:'管理者キーが正しくありません。'},401);
 if(!env.DONBEAT_BUCKET)return json({error:'保存先が未設定です。CloudflareでR2バケットをDONBEAT_BUCKETとして接続し、再デプロイしてください。'},503);
 const bucket=env.DONBEAT_BUCKET,url=new URL(request.url),id=url.searchParams.get('id');
 try{
  if(request.method==='GET')return json({ready:true});
  if(!idOK(id))return json({error:'アップロードIDが不正です。'},400);
  const prefix='files/'+id+'/',catalogKey='catalog/'+id+'.json';
  if(request.method==='DELETE'){
   await bucket.delete(catalogKey);
   let cursor;do{const page=await bucket.list({prefix,cursor});if(page.objects.length)await bucket.delete(page.objects.map(o=>o.key));cursor=page.truncated?page.cursor:undefined}while(cursor);
   return json({ok:true});
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
    for(const k of ['soflan','scrollOnNotes','fadeOnNotes','branch','dummy','damage','fadeout','mv'])entry.features[k]=s.features?.[k]===true;
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
