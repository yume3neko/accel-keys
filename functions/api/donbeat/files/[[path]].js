export async function onRequestGet({request,env}){
 if(!env.DONBEAT_BUCKET)return new Response('Not found',{status:404});
 let raw;try{raw=new URL(request.url).pathname.slice('/api/donbeat/files/'.length).split('/').map(decodeURIComponent).join('/')}catch{return new Response('Bad path',{status:400})}
 if(typeof raw!=='string'||/[\\\x00-\x1f]/.test(raw)||raw.split('/').some(p=>!p||p==='.'||p==='..'))return new Response('Bad path',{status:400});
 const id=raw.split('/')[0];if(!/^[a-f0-9-]{36}$/.test(id)||!await env.DONBEAT_BUCKET.head('catalog/'+id+'.json'))return new Response('Not found',{status:404});
 const object=await env.DONBEAT_BUCKET.get('files/'+raw);if(!object)return new Response('Not found',{status:404});
 return new Response(object.body,{headers:{'content-type':'application/octet-stream','content-length':String(object.size),'cache-control':'public,max-age=3600','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'",etag:object.httpEtag}});
}
