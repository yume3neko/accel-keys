// Dedicated DONBEAT administrator sessions. The administrator's R2 token never
// enters URLs, localStorage, or routine upload/management requests.
const COOKIE='donbeat_admin_session';
const MAX_AGE=8*60*60;
const encoder=new TextEncoder();
const hex=bytes=>Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
const equal=(a,b)=>{if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a[i]^b[i];return d===0};
const digest=async text=>new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(text)));
const secretOK=env=>typeof env.DONBEAT_ADMIN_TOKEN==='string'&&env.DONBEAT_ADMIN_TOKEN.length>=16;
const key=async env=>crypto.subtle.importKey('raw',await digest('DONBEAT session v1: '+env.DONBEAT_ADMIN_TOKEN),{name:'HMAC',hash:'SHA-256'},false,['sign']);
const mac=async(env,message)=>hex(new Uint8Array(await crypto.subtle.sign('HMAC',await key(env),encoder.encode(message))));
const json=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});
export async function correctSecret(candidate,env){
 if(!secretOK(env)||typeof candidate!=='string'||candidate.length>2048)return false;
 const [a,b]=await Promise.all([digest(candidate),digest(env.DONBEAT_ADMIN_TOKEN)]);
 return equal(a,b);
}
export async function createSession(env,request){
 const expires=Math.floor(Date.now()/1000)+MAX_AGE,nonce=hex(crypto.getRandomValues(new Uint8Array(16)));
 const body='v1.'+expires+'.'+nonce,value=body+'.'+await mac(env,body);
 const secure=new URL(request.url).protocol==='https:'?'; Secure':'';
 return COOKIE+'='+value+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+MAX_AGE+secure;
}
export function clearSession(request){
 const secure=new URL(request.url).protocol==='https:'?'; Secure':'';
 return COOKIE+'=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'+secure;
}
export async function hasSession(request,env){
 if(!secretOK(env))return false;
 const raw=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='));
 if(!raw)return false;
 const value=raw.slice(COOKIE.length+1),m=value.match(/^(v1\.(\d{10})\.[a-f0-9]{32})\.([a-f0-9]{64})$/);
 if(!m)return false;
 const expires=Number(m[2]);
 if(!Number.isSafeInteger(expires)||expires<=Math.floor(Date.now()/1000)||expires>Math.floor(Date.now()/1000)+MAX_AGE+60)return false;
 const expected=await mac(env,m[1]);return equal(encoder.encode(expected),encoder.encode(m[3]));
}
export async function requireSession(request,env){
 if(!secretOK(env))return json({error:'DONBEAT_ADMIN_TOKEN が設定されていません。'},503);
 if(!await hasSession(request,env))return json({error:'管理者セッションが期限切れです。ログインし直してください。'},401);
 if(!['GET','HEAD','OPTIONS'].includes(request.method)){
  const origin=request.headers.get('origin'),url=new URL(request.url);
  if(origin&&origin!==url.origin)return json({error:'別サイトからの操作は許可されていません。'},403);
  if(request.headers.get('sec-fetch-site')==='cross-site')return json({error:'別サイトからの操作は許可されていません。'},403);
 }
 return null;
}
export const noStore=json;
