export async function onRequestGet({request,env}){
 if(!env.DONBEAT_BUCKET)return new Response('Not found',{status:404});
 let raw;try{raw=new URL(request.url).pathname.slice('/api/donbeat/files/'.length).split('/').map(decodeURIComponent).join('/')}catch{return new Response('Bad path',{status:400})}
 if(typeof raw!=='string'||/[\\\x00-\x1f]/.test(raw)||raw.split('/').some(p=>!p||p==='.'||p==='..'))return new Response('Bad path',{status:400});
 const id=raw.split('/')[0];if(!/^[a-f0-9-]{36}$/.test(id)||!await env.DONBEAT_BUCKET.head('catalog/'+id+'.json'))return new Response('Not found',{status:404});
 const object=await env.DONBEAT_BUCKET.get('files/'+raw);if(!object)return new Response('Not found',{status:404});
 const ext=raw.split('.').pop().toLowerCase(),fallback=({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',mp4:'video/mp4',webm:'video/webm',m4v:'video/x-m4v',mp3:'audio/mpeg',ogg:'audio/ogg',wav:'audio/wav',m4a:'audio/mp4',flac:'audio/flac',tja:'text/plain; charset=utf-8',mc:'application/json'})[ext]||'application/octet-stream';
 return new Response(object.body,{headers:{'content-type':object.httpMetadata?.contentType||fallback,'content-length':String(object.size),'cache-control':'public,max-age=3600','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'",etag:object.httpEtag}});
}
