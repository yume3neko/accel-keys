import {hasAdminSession} from '../_shared/donbeat-auth.js';
// /donbeat/upload and /donbeat/upload.html both require a valid administrator cookie.
// The actual HTML is stored as a .txt asset and never exposed by a public HTML route.
export async function onRequestGet(context){
 if(!await hasAdminSession(context.request,context.env))
  return new Response(null,{status:302,headers:{location:'/donbeat/admin-login.html','cache-control':'no-store'}});
 const origin=new URL(context.request.url).origin;
 const asset=await context.env.ASSETS.fetch(origin+'/donbeat/admin-content.txt');
 if(!asset.ok)return new Response('DONBEATの管理画面を読み込めませんでした。',{status:503});
 const headers=new Headers(asset.headers);
 headers.set('content-type','text/html; charset=utf-8');
 headers.set('cache-control','private, no-store');
 headers.set('x-content-type-options','nosniff');
 headers.set('content-security-policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
 return new Response(asset.body,{status:200,headers});
}
