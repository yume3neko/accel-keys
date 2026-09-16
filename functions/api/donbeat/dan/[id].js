export async function onRequestGet({params,env}){
 if(!env.DONBEAT_BUCKET)return new Response('Not found',{status:404});
 const id=String(params.id||'');if(!/^[a-f0-9-]{36}$/.test(id)||!await env.DONBEAT_BUCKET.head('dan-catalog/'+id+'.json'))return new Response('Not found',{status:404});
 const file=await env.DONBEAT_BUCKET.get('dan/'+id+'.dan');if(!file)return new Response('Not found',{status:404});
 return new Response(file.body,{headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
}
