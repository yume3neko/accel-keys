export async function onRequestGet({env}){
 const songs=[];if(env.DONBEAT_BUCKET){let cursor;do{const page=await env.DONBEAT_BUCKET.list({prefix:'catalog/',cursor});for(const o of page.objects){const file=await env.DONBEAT_BUCKET.get(o.key);if(file){const data=await file.json();songs.push(...(data.songs||[]))}}cursor=page.truncated?page.cursor:undefined}while(cursor)}
 return Response.json({songs},{headers:{'cache-control':'no-store'}});
}
