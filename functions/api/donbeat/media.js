// Public DONBEAT media are readable only after the entire batch is published.
// Uploaded-but-incomplete files are deliberately inaccessible to players.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIME={tja:'text/plain; charset=utf-8',mc:'application/json',ogg:'audio/ogg',mp3:'audio/mpeg',wav:'audio/wav',m4a:'audio/mp4',flac:'audio/flac',opus:'audio/ogg',aac:'audio/aac',mp4:'video/mp4',webm:'video/webm',m4v:'video/mp4',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif'};
async function serve({request,env},head=false){
 const bucket=env.DONBEAT_BUCKET;
 if(!bucket)return new Response('Media storage unavailable',{status:503});
 const q=new URL(request.url).searchParams,batch=q.get('batch'),path=q.get('path');
 if(!UUID.test(batch||'')||typeof path!=='string'||path.length>700||path.startsWith('/')||path.includes('\\')||
  path.split('/').some(s=>!s||s==='.'||s==='..'||/[\u0000-\u001f\u007f]/.test(s)))
  return new Response('Invalid media path',{status:400});
 const published=await bucket.head('catalog/import-'+batch+'.json');
 if(!published)return new Response('Not published',{status:404});
 const key='uploads/'+batch+'/'+path;
 const object=head?await bucket.head(key):await bucket.get(key,{range:request.headers});
 if(!object)return new Response('Not found',{status:404});
 const h=new Headers();
 object.writeHttpMetadata(h);
 const mime=MIME[path.split('.').pop().toLowerCase()];
 if(mime)h.set('Content-Type',mime);
 h.set('Accept-Ranges','bytes');
 h.set('ETag',object.httpEtag);
 h.set('Cache-Control','public, max-age=31536000, immutable');
 h.set('X-Content-Type-Options','nosniff');
 const range=object.range;
 if(!head&&range&&Number.isFinite(range.offset)&&Number.isFinite(range.length)){
  h.set('Content-Range','bytes '+range.offset+'-'+(range.offset+range.length-1)+'/'+object.size);
  h.set('Content-Length',String(range.length));
  return new Response(object.body,{status:206,headers:h});
 }
 h.set('Content-Length',String(object.size));
 return new Response(head?null:object.body,{status:200,headers:h});
}
export const onRequestGet=context=>serve(context,false);
export const onRequestHead=context=>serve(context,true);
