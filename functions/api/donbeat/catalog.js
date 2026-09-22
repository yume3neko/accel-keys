const officialTitles=new Set(['BATTLE NO.1','六本の薔薇','六本の薔薇と采の歌','Nivalis','Nivalis*Anima','魔宵月','エンジェルドリーム','銀の黎明','銀の黎明か、黒の晶華か。','銀の黎明か、黒の晶華か','リスドンヴァルナ','リスドンヴァルナの黄昏','らんぶる','らんぶる乱舞'].map(s=>s.normalize('NFKC').toLowerCase().replace(/[\s　・_-]/g,'')));
const songCategory=s=>{
 const explicit=s?.category==='official'||s?.category==='creative'?s.category:null;
 if(s?.categoryManual===true&&explicit)return explicit;
 if(officialTitles.has(String(s?.title||'').normalize('NFKC').toLowerCase().replace(/[\s　・_-]/g,'')))return 'official';
 return explicit||'creative';
};
export async function onRequestGet({env}){
 const songs=[];if(env.DONBEAT_BUCKET){let cursor;do{const page=await env.DONBEAT_BUCKET.list({prefix:'catalog/',cursor});for(const o of page.objects){const file=await env.DONBEAT_BUCKET.get(o.key);if(file){const data=await file.json();songs.push(...(data.songs||[]).map(song=>({...song,category:songCategory(song)})))}}cursor=page.truncated?page.cursor:undefined}while(cursor)}
 return Response.json({songs},{headers:{'cache-control':'no-store'}});
}
