import {hasAdminSession} from '../_shared/donbeat-auth.js';
export async function onRequestGet(context){
 if(!await hasAdminSession(context.request,context.env))
  return new Response(null,{status:302,headers:{'location':'/donbeat/admin-login.html','cache-control':'no-store'}});
 const response=await context.next();
 const headers=new Headers(response.headers);
 headers.set('cache-control','private,no-store');
 headers.set('x-content-type-options','nosniff');
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
