import {hasSession} from './_lib/donbeat-session.js';

// Root middleware also runs before static Pages assets. Unlike client-only
// redirects, this prevents unauthenticated delivery of the management HTML.
export async function onRequest({request,env,next}){
 const path=new URL(request.url).pathname;
 if(path!=='/donbeat/upload.html'&&path!=='/donbeat/upload')return next();
 if(!await hasSession(request,env))
  return Response.redirect(new URL('/donbeat/login.html',request.url).href,302);
 const response=await next();
 const headers=new Headers(response.headers);
 headers.set('Cache-Control','private, no-store');
 headers.set('X-Robots-Tag','noindex, nofollow');
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
