import {hasAdminSession} from '../_shared/donbeat-auth.js';
// Protect both /donbeat/upload.html and Pages' optional extensionless HTML route.
// DONBEAT game assets and the standalone login page remain public.
export async function onRequest(context){
 const path=new URL(context.request.url).pathname;
 if((path==='/donbeat/upload.html'||path==='/donbeat/upload')&&
    context.request.method==='GET'&&!await hasAdminSession(context.request,context.env))
  return new Response(null,{status:302,headers:{location:'/donbeat/admin-login.html','cache-control':'no-store'}});
 return context.next();
}
