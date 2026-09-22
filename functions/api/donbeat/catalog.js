const officialTitles=new Set(['BATTLE NO.1','六本の薔薇','Nivalis','魔宵月','エンジェルドリーム','銀の黎明','リスドンヴァルナ','らんぶる'].map(s=>s.normalize('NFKC').toLowerCase().replace(/[\s　・_-]/g,'')));
const songCategory=s=>s?.category==='official'||s?.category==='creative'?s.category:officialTitles.has(String(s?.title||'').normalize('NFKC').toLowerCase().replace(/[\s　・_-]/g,''))?'official':'creative';
export async function onRequestGet({env}){
 const songs=[];if(env.DONBEAT_BUCKET){let cursor;do{const page=await env.DONBEAT_BUCKET.list({prefix:'catalog/',cursor});for(const o of page.objects){const file=await env.DONBEAT_BUCKET.get(o.key);if(file){const data=await file.json();songs.push(...(data.songs||[]).map(song=>({...song,category:songCategory(song)})))}}cursor=page.truncated?page.cursor:undefined}while(cursor)}
 return Response.json({songs},{headers:{'cache-control':'no-store'}});
}
