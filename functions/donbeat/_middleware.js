import {hasSession} from '../_lib/donbeat-session.js';
export async function onRequest({request,env,next}){
 const path=new URL(request.url).pathname;
 // Static assets must not disclose the administrator dashboard before login.
 if(path==='/donbeat/upload.html'||path==='/donbeat/upload'){
  if(!await hasSession(request,env)){
   return Response.redirect(new URL('/donbeat/login.html',request.url).href,302);
  }
 }
 const response=await next();
 if(path==='/donbeat/upload.html'||path==='/donbeat/upload'){
  const headers=new Headers(response.headers);
  headers.set('Cache-Control','private, no-store');
  headers.set('X-Robots-Tag','noindex, nofollow');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
 }
 return response;
}
