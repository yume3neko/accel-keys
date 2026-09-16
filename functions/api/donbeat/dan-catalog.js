export async function onRequestGet({env}){
 const presets=[],disabledStatic=[];if(env.DONBEAT_BUCKET){let cursor;do{const page=await env.DONBEAT_BUCKET.list({prefix:'dan-catalog/',cursor});for(const o of page.objects){const file=await env.DONBEAT_BUCKET.get(o.key);if(file)presets.push(await file.json())}cursor=page.truncated?page.cursor:undefined}while(cursor);cursor=undefined;do{const page=await env.DONBEAT_BUCKET.list({prefix:'dan-disabled/',cursor});for(const o of page.objects)disabledStatic.push(o.key.slice('dan-disabled/'.length,-5));cursor=page.truncated?page.cursor:undefined}while(cursor)}
 presets.sort((a,b)=>String(a.title).localeCompare(String(b.title),'ja'));return Response.json({presets,disabledStatic},{headers:{'cache-control':'no-store'}});
}
