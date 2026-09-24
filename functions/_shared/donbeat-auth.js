// Cookie-based DONBEAT administrator session. Never expose DONBEAT_ADMIN_TOKEN to the upload UI.
const COOKIE='__Host-donbeat_admin',TTL=8*60*60;
const encoder=new TextEncoder();
const response=(message,status)=>Response.json({error:message},{status,headers:{'cache-control':'no-store'}});
function secret(env){
 const value=env?.DONBEAT_ADMIN_TOKEN;
 return typeof value==='string'&&value.length>=16?value:null;
}
function bytesToHex(bytes){return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')}
async function hmac(value,payload){
 const key=await crypto.subtle.importKey('raw',encoder.encode(value),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return bytesToHex(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(payload))));
}
function constantEqual(a,b){
 if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
 let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
 return diff===0;
}
export function checkWriteOrigin(request){
 const origin=request.headers.get('Origin');
 const site=request.headers.get('Sec-Fetch-Site');
 if(site==='cross-site'||(origin&&origin!==new URL(request.url).origin))
  return response('別サイトからの管理操作はできません。',403);
 return null;
}
export async function hasAdminSession(request,env){
 const value=secret(env);if(!value)return false;
 const cookie=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='));
 if(!cookie)return false;
 const raw=cookie.slice((COOKIE+'=').length);
 const bits=raw.split('.');
 if(bits.length!==3||!/^\d{10,13}$/.test(bits[0])||!/^[0-9a-f]{32}$/.test(bits[1])||!/^[0-9a-f]{64}$/.test(bits[2]))return false;
 const created=Number(bits[0]),now=Math.floor(Date.now()/1000);
 if(!Number.isSafeInteger(created)||created>now+60||now-created>=TTL)return false;
 return constantEqual(bits[2],await hmac(value,bits[0]+'.'+bits[1]));
}
export async function requireAdmin(request,env){
 if(!secret(env))return response('DONBEAT_ADMIN_TOKEN が未設定です。',503);
 return await hasAdminSession(request,env)?null:response('管理者ログインが必要です。',401);
}
export async function login(request,env){
 const value=secret(env);
 if(!value)return response('DONBEAT_ADMIN_TOKEN が未設定です。',503);
 if(checkWriteOrigin(request))return checkWriteOrigin(request);
 if(Number(request.headers.get('content-length'))>4096)return response('認証情報が大きすぎます。',413);
 let supplied;try{const data=await request.json();supplied=data?.token}catch{return response('認証情報が不正です。',400)}
 // Compare SHA-256 digests without leaking token length through an early string comparison.
 const digest=async v=>new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(v)));
 const [a,b]=await Promise.all([digest(typeof supplied==='string'?supplied:''),digest(value)]);
 let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
 if(diff||!supplied)return response('管理者キーが正しくありません。',401);
 const time=Math.floor(Date.now()/1000),nonce=bytesToHex(crypto.getRandomValues(new Uint8Array(16))),payload=time+'.'+nonce;
 const cookie=payload+'.'+await hmac(value,payload);
 return new Response(JSON.stringify({authenticated:true,expiresIn:TTL}),{
  headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',
   'set-cookie':COOKIE+'='+cookie+'; Max-Age='+TTL+'; Path=/; HttpOnly; Secure; SameSite=Strict'}
 });
}
export function logout(){
 return new Response(JSON.stringify({authenticated:false}),{
  headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',
   'set-cookie':COOKIE+'=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict'}
 });
}
