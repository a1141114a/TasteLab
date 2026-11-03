import {isAdministrator,verifyAdministrator,administratorCookie,clearAdministratorCookie,type AdminEnv} from './admin-auth';
import {GithubStore,StorageError,type StoreEnv} from './github-store';
type Env=StoreEnv&AdminEnv&{DB?:D1Database;BUCKET?:R2Bucket;GUEST_SIGNING_SECRET?:string;ADMIN_EMAIL?:string;ALLOW_LOCAL_SQLITE_TESTING?:string};
const categoryIds=new Set(['korean','chinese','japanese','thai','vietnamese','italian','french','western','fast','soup','bbq','seafood','chicken','tteok','rice','noodles','hotpot','pasta','street','bakery','dessert','bingsu','cafe','breakfast','brunch','late','solo','friends','date']);
const areaIds=new Set(['seongsu','hannam','hongdae','ewha','gangnam','apgujeong','myeongdong','jongno','other']);
const enc=new TextEncoder();const DAY=86400000;const MAX_BODY=21*1024*1024;
class ApiError extends Error{constructor(public code:string,public status=400){super(code)}}
const json=(body:unknown,status=200,headers:Record<string,string>={})=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
async function mac(secret:string,value:string){const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(value)))].map(v=>v.toString(16).padStart(2,'0')).join('')}
function equal(a:string,b:string){if(a.length!==b.length)return false;let out=0;for(let i=0;i<a.length;i++)out|=a.charCodeAt(i)^b.charCodeAt(i);return out===0}
async function session(request:Request,secret:string){const raw=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('tastelab_guest='))?.slice(15)||'';const [id,sig]=raw.split('.');let guest=id;let fresh=false;if(!id||!/^[a-f0-9-]{36}$/.test(id)||!sig||!equal(sig,await mac(secret,'cookie:'+id))){guest=crypto.randomUUID();fresh=true}return{guest,key:await mac(secret,'guest:'+guest),csrf:await mac(secret,'csrf:'+guest),cookie:fresh?`tastelab_guest=${guest}.${await mac(secret,'cookie:'+guest)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=15552000${new URL(request.url).protocol==='https:'?'; Secure':''}`:null}}
const admin=isAdministrator;
function text(form:FormData,key:string,min:number,max:number){const value=form.get(key);if(typeof value!=='string')throw new ApiError('invalid_'+key);const clean=value.trim().normalize('NFC');if(clean.length<min||clean.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(clean))throw new ApiError('invalid_'+key);return clean}
async function body(request:Request){if(Number(request.headers.get('content-length')||0)>MAX_BODY)throw new ApiError('too_large',413);const reader=request.body?.getReader();if(!reader)throw new ApiError('empty_body');let length=0;const chunks:Uint8Array[]=[];for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>MAX_BODY){await reader.cancel();throw new ApiError('too_large',413)}chunks.push(value)}const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}return new Response(bytes,{headers:{'Content-Type':request.headers.get('content-type')||''}})}
function image(bytes:Uint8Array){if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255){const pieces:Uint8Array[]=[bytes.slice(0,2)];let offset=2;while(offset<bytes.length){if(bytes[offset]!==255)throw new ApiError('invalid_image');const mark=bytes[offset+1];if(mark===0xda||mark===0xd9){pieces.push(bytes.slice(offset));break}const length=(bytes[offset+2]<<8)|bytes[offset+3];if(length<2||offset+length+2>bytes.length)throw new ApiError('invalid_image');if(mark!==0xe1)pieces.push(bytes.slice(offset,offset+length+2));offset+=length+2}const total=pieces.reduce((a,p)=>a+p.length,0);const out=new Uint8Array(total);let pos=0;for(const p of pieces){out.set(p,pos);pos+=p.length}return{bytes:out,mime:'image/jpeg'}}if(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71&&bytes[12]===73&&bytes[13]===72&&bytes[14]===68&&bytes[15]===82){const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.length);if(view.getUint32(16)*view.getUint32(20)>40000000)throw new ApiError('image_dimensions');return{bytes,mime:'image/png'}}if(new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP')return{bytes,mime:'image/webp'};throw new ApiError('invalid_image')}
async function rate(db:D1Database,key:string,limit:number){const period=Math.floor(Date.now()/DAY);const result=await db.prepare('INSERT INTO request_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<? RETURNING count').bind(key+':'+period,(period+2)*DAY,limit).first();if(!result)throw new ApiError('rate_limited',429)}
function publicRecord(row:Record<string,unknown>){return{id:row.id,name:row.name,koreanName:row.korean_name,nickname:row.nickname,address:row.address,area:row.area,categories:JSON.parse(String(row.categories)),recommendation:row.recommendation,spend:row.spend,status:row.status,createdAt:row.created_at}}
export async function handleCommunity(request:Request,env:Env){
try{
if(env.GITHUB_DATA_TOKEN)return await handleGithub(request,env);
if(env.ALLOW_LOCAL_SQLITE_TESTING!=='true'||!['localhost','127.0.0.1'].includes(new URL(request.url).hostname))return json({error:'github_not_configured'},503);
if(!env.DB||!env.BUCKET||!env.GUEST_SIGNING_SECRET)return json({error:'service_unavailable'},503);
const db=env.DB,bucket=env.BUCKET,secret=env.GUEST_SIGNING_SECRET,url=new URL(request.url),path=url.pathname.replace(/^\/api\/community/,'');
const s=await session(request,secret);const isAdmin=await admin(request,env);const headers:Record<string,string>={};if(s.cookie)headers['Set-Cookie']=s.cookie;
if(path==='/session'&&request.method==='GET')return json({csrfToken:s.csrf,isAdmin,signedIn:isAdmin},200,headers);
if(request.method==='POST'){if(request.headers.get('origin')!==url.origin||!equal(request.headers.get('x-tastelab-csrf')||'',s.csrf))throw new ApiError('invalid_session',403)}
if(path==='/submissions'&&request.method==='GET'){
const mode=url.searchParams.get('view');if(mode==='admin'&&!isAdmin)throw new ApiError('forbidden',403);
const result=mode==='admin'?await db.prepare('SELECT * FROM submissions WHERE status=? ORDER BY created_at DESC LIMIT 100').bind('pending').all():mode==='mine'?await db.prepare('SELECT * FROM submissions WHERE guest_key=? ORDER BY created_at DESC LIMIT 100').bind(s.key).all():await db.prepare('SELECT * FROM submissions WHERE status=? ORDER BY created_at DESC LIMIT 200').bind('approved').all();
const records=[];for(const row of result.results){const pictures=await db.prepare('SELECT id FROM photos WHERE submission_id=? ORDER BY created_at').bind(row.id).all();records.push({...publicRecord(row),photos:pictures.results.map(p=>'/api/community/photos/'+p.id)})}return json({items:records},200,headers)
}
if(path==='/submissions'&&request.method==='POST'){
const ip=request.headers.get('cf-connecting-ip');if(ip)await rate(db,'ip:'+await mac(secret,'ip:'+ip),30);
const form=await(await body(request)).formData();if(form.get('website'))throw new ApiError('invalid_submission');if(form.get('consent')!=='yes')throw new ApiError('consent_required');
const name=text(form,'name',2,120),koreanName=text(form,'koreanName',0,120),nickname=text(form,'nickname',1,40),address=text(form,'address',5,250),area=text(form,'area',1,40),recommendation=text(form,'recommendation',20,2000);
if(!areaIds.has(area))throw new ApiError('invalid_area');const categories=[...new Set(form.getAll('categories').map(String))];if(!categories.length||categories.length>8||categories.some(c=>!categoryIds.has(c)))throw new ApiError('invalid_categories');
const spendRaw=text(form,'spend',0,10),spend=spendRaw?Number(spendRaw):null;if(spend!==null&&(!Number.isInteger(spend)||spend<0||spend>10000000))throw new ApiError('invalid_spend');
const files=form.getAll('photos').filter((value):value is File=>typeof value!=='string'&&value.size>0);if(files.length<1||files.length>4)throw new ApiError('invalid_photo_count');
const verified=[];for(const file of files){if(file.size>5*1024*1024)throw new ApiError('image_too_large',413);verified.push(image(new Uint8Array(await file.arrayBuffer())))}
await rate(db,'guest:'+s.key,5);
const id=crypto.randomUUID(),now=Date.now(),uploaded:string[]=[];try{const rows=[];for(const photo of verified){const photoId=crypto.randomUUID(),objectKey='submissions/'+id+'/'+photoId;await bucket.put(objectKey,photo.bytes,{httpMetadata:{contentType:photo.mime},customMetadata:{submissionId:id}});uploaded.push(objectKey);rows.push(db.prepare('INSERT INTO photos(id,submission_id,object_key,mime,size,created_at) VALUES(?,?,?,?,?,?)').bind(photoId,id,objectKey,photo.mime,photo.bytes.length,now))}
await db.batch([db.prepare('INSERT INTO submissions(id,guest_key,nickname,name,korean_name,address,area,categories,recommendation,spend,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,s.key,nickname,name,koreanName,address,area,JSON.stringify(categories),recommendation,spend,'pending',now,now),...rows]);
}catch(error){await Promise.all(uploaded.map(key=>bucket.delete(key)));throw error}
return json({id,status:'pending',createdAt:now},201,headers)
}
const photoMatch=path.match(/^\/photos\/([a-f0-9-]{36})$/);if(photoMatch&&request.method==='GET'){
const photo=await db.prepare('SELECT p.*,s.status,s.guest_key FROM photos p JOIN submissions s ON s.id=p.submission_id WHERE p.id=?').bind(photoMatch[1]).first();if(!photo||(photo.status!=='approved'&&photo.guest_key!==s.key&&!isAdmin))throw new ApiError('not_found',404);const object=await bucket.get(String(photo.object_key));if(!object)throw new ApiError('not_found',404);return new Response(object.body,{headers:{'Content-Type':String(photo.mime),'X-Content-Type-Options':'nosniff','Cache-Control':photo.status==='approved'?'public,max-age=300':'private,no-store','Content-Disposition':'inline'}})
}
const moderate=path.match(/^\/submissions\/([a-f0-9-]{36})\/moderate$/);if(moderate&&request.method==='POST'){
if(!isAdmin)throw new ApiError('forbidden',403);const input=await(await body(request)).json() as {status?:string};if(!['approved','rejected'].includes(input.status||''))throw new ApiError('invalid_status');const id=moderate[1];const exists=await db.prepare('SELECT status FROM submissions WHERE id=?').bind(id).first();if(!exists)throw new ApiError('not_found',404);if(exists.status!=='pending')throw new ApiError('already_reviewed',409);
const changed=await db.batch([db.prepare('UPDATE submissions SET status=?,updated_at=? WHERE id=? AND status=?').bind(input.status,Date.now(),id,'pending'),db.prepare('INSERT INTO moderation_log(id,submission_id,actor,action,created_at) SELECT ?,?,?,?,? WHERE changes()=1').bind(crypto.randomUUID(),id,request.headers.get('oai-authenticated-user-id'),input.status,Date.now())]);if(!changed[0].meta.changes)throw new ApiError('already_reviewed',409);return json({id,status:input.status},200,headers)
}
return json({error:'not_found'},404,headers)
}catch(error){if(error instanceof ApiError||error instanceof StorageError)return json({error:error.code},error.status,error.status===429?{'Retry-After':'86400'}:{});console.error('TasteLab community request failed',error instanceof Error?error.name:'unknown');return json({error:'request_failed'},500)}
}
async function handleGithub(request:Request,env:Env){
if(!env.GUEST_SIGNING_SECRET)throw new ApiError('service_unavailable',503);
const secret=env.GUEST_SIGNING_SECRET,url=new URL(request.url),path=url.pathname.replace(/^\/api\/community/,'');const s=await session(request,secret),isAdmin=await admin(request,env),store=new GithubStore(env);const headers:Record<string,string>={};if(s.cookie)headers['Set-Cookie']=s.cookie;
if(path==='/session'&&request.method==='GET')return json({csrfToken:s.csrf,isAdmin,signedIn:isAdmin},200,headers);
if(request.method==='POST'&&(request.headers.get('origin')!==url.origin||!equal(request.headers.get('x-tastelab-csrf')||'',s.csrf)))throw new ApiError('invalid_session',403);

if(path==='/auth/login'&&request.method==='POST'){
 const input=await(await body(request)).json() as {username?:string;password?:string};
 const ip=request.headers.get('cf-connecting-ip')||s.key;
 await store.limitLogin(await mac(secret,'admin-login:'+ip));
 if(typeof input.username!=='string'||typeof input.password!=='string'||input.username.length>80||input.password.length>256||!await verifyAdministrator(input.username,input.password,env))throw new ApiError('invalid_credentials',401);
 return json({isAdmin:true},200,{'Set-Cookie':await administratorCookie(env)});
}
if(path==='/auth/logout'&&request.method==='POST')return json({isAdmin:false},200,{'Set-Cookie':clearAdministratorCookie});
if(path==='/submissions'&&request.method==='GET'){const rows=await store.list(url.searchParams.get('view')||'',s.key,isAdmin);return json({items:rows.map(row=>({...publicRecord(row),photos:row.photos.map(photo=>'/api/community/photos/'+photo.id)}))},200,headers)}
if(path==='/submissions'&&request.method==='POST'){
const form=await(await body(request)).formData();if(form.get('website'))throw new ApiError('invalid_submission');if(form.get('consent')!=='yes')throw new ApiError('consent_required');
const name=text(form,'name',2,120),korean_name=text(form,'koreanName',0,120),nickname=text(form,'nickname',1,40),address=text(form,'address',5,250),area=text(form,'area',1,40),recommendation=text(form,'recommendation',20,2000);
if(!areaIds.has(area))throw new ApiError('invalid_area');const categories=[...new Set(form.getAll('categories').map(String))];if(!categories.length||categories.length>8||categories.some(c=>!categoryIds.has(c)))throw new ApiError('invalid_categories');
const spendRaw=text(form,'spend',0,10),spend=spendRaw?Number(spendRaw):null;if(spend!==null&&(!Number.isInteger(spend)||spend<0||spend>10000000))throw new ApiError('invalid_spend');const requestId=form.get('requestId');if(requestId&&!/^[a-f0-9-]{36}$/.test(String(requestId)))throw new ApiError('invalid_request_id');const id=requestId?String(requestId):crypto.randomUUID();
const files=form.getAll('photos').filter((value):value is File=>typeof value!=='string'&&value.size>0);if(files.length<1||files.length>4)throw new ApiError('invalid_photo_count');const pictures=[];for(const file of files){if(file.size>5*1024*1024)throw new ApiError('image_too_large',413);const verified=image(new Uint8Array(await file.arrayBuffer()));pictures.push({id:crypto.randomUUID(),...verified})}
const now=Date.now(),ip=request.headers.get('cf-connecting-ip');const record=await store.create({id,guest_key:s.key,ip_key:ip?await mac(secret,'ip:'+ip):undefined,nickname,name,korean_name,address,area,categories:JSON.stringify(categories),recommendation,spend,status:'pending',created_at:now,updated_at:now,photos:[]},pictures);return json({id:record.id,status:record.status,createdAt:record.created_at},201,headers)
}
const photoMatch=path.match(/^\/photos\/([a-f0-9-]{36})$/);if(photoMatch&&request.method==='GET'){const photo=await store.photo(photoMatch[1],s.key,isAdmin);return new Response(photo.bytes,{headers:{'Content-Type':photo.mime,'X-Content-Type-Options':'nosniff','Cache-Control':photo.public?'public,max-age=300':'private,no-store','Content-Disposition':'inline'}})}
const moderate=path.match(/^\/submissions\/([a-f0-9-]{36})\/moderate$/);if(moderate&&request.method==='POST'){if(!isAdmin)throw new ApiError('forbidden',403);const input=await(await body(request)).json() as {status?:string};if(!['approved','rejected'].includes(input.status||''))throw new ApiError('invalid_status');const record=await store.moderate(moderate[1],input.status!,'administrator');return json({id:record.id,status:record.status},200,headers)}
return json({error:'not_found'},404,headers)
}
