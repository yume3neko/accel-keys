export const CREATOR_NAME='ゆめみねこ';
// Preserve the existing authenticated storage marker; display it as a badge.
export const CREATOR_RECORD='ゆめみねこ（製作者）';
export const normalizeName=value=>String(value??'').normalize('NFKC').replace(/[\s\p{Cf}<>\x00-\x1f]/gu,'');
export const reservedName=value=>normalizeName(value).includes(CREATOR_NAME);
export function identifyName(value,password,env){
 const raw=String(value??'');
 const direct=Boolean(env.ADMIN_TOKEN&&raw===env.ADMIN_TOKEN);
 if(direct)return {name:CREATOR_NAME,creator:true};
 if(reservedName(raw))throw Object.assign(new Error('この名前は使えません'),{status:400,code:'NAME_NOT_ALLOWED'});
 return {name:raw.trim().replace(/[<>\x00-\x1f]/g,'').slice(0,12),creator:false};
}
export function displayRecord(record){
 const creator=normalizeName(record.name)==='ゆめみねこ(製作者)';
 return {...record,name:creator?CREATOR_NAME:record.name,creator};
}

