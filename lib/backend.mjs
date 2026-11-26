import { readState, writeState } from '../db/state-store.mjs';

import { adminTotpSecret, matchTotpStep } from './admin-totp.mjs';
import { pushConfigured, pushSubscription, sendPush } from './push.mjs';

const json=(body,status=200,extra={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff',...extra}});
class Fault extends Error{constructor(message,status=400){super(message);this.status=status}}
const fail=(message,status=400)=>{throw new Fault(message,status)};
const clean=(v,max=100)=>String(v??'').trim().slice(0,max);
const uid=()=>crypto.randomUUID();
const sectors={cafe:'Un café gratis',barberia:'Un corte gratis',heladeria:'Un helado gratis',cerveceria:'Una pinta gratis',bar:'Un beneficio de la casa',otro:'Una recompensa especial'};
const seed=()=>({cafes:[['central','Café Central','cafe'],['botanico','Botánico Café','cafe'],['barberia-demo','Barbería Distrito','barberia'],['cerveceria-demo','Cervecería Andina','cerveceria'],['bar-demo','Bar La Esquina','bar']].map(([id,name,sector])=>({id,name,sector,city:'Mendoza',owner:'Sin dueño aprobado',active:true,totalStamps:9,milestones:[{id:uid(),at:9,label:sectors[sector]}]})),clients:[],events:[],campaigns:[],ownerRequests:[],admins:[],operations:[],limits:{}});
const hash=async v=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)))).map(x=>x.toString(16).padStart(2,'0')).join('');
async function passwordDigest(password,salt){let key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);return Array.from(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations:100000},key,256))).map(x=>x.toString(16).padStart(2,'0')).join('')}
function cookieSecurity(req, env) {
  const url = new URL(req.url);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const dockerHttp = env?.CLUB_DOCKER_PREVIEW === '1' && url.protocol === 'http:';
  return loopback || dockerHttp ? '' : ' Secure;';
}
function ownerCookie(req, value, maxAge = 604800, env) {
  return 'cf_owner='+value+'; Path=/; HttpOnly;'+cookieSecurity(req,env)+' SameSite=Lax; Max-Age='+maxAge;
}
async function sessionActor(s,req){let token=req.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('cf_owner='))?.slice(9);if(!token)return null;let digest=await hash(token),session=(s.ownerSessions||[]).find(x=>x.hash===digest&&x.expires>Date.now()),access=session&&(s.ownerCredentials||[]).find(x=>x.id===session.ownerId);if(!access)return null;return {id:access.id,email:access.username,name:access.name,localLogin:true}}
function adminEmails(env){let allowed=[];try{allowed=JSON.parse(env.SUPERADMIN_EMAILS||'[]')}catch{}if(!Array.isArray(allowed))allowed=[];if(!allowed.length&&env.BOOTSTRAP_OWNER_EMAIL)allowed=[env.BOOTSTRAP_OWNER_EMAIL];return allowed.map(x=>String(x).trim().toLowerCase())}
function adminToken(req){return req.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('cf_admin='))?.slice(9)||''}
function adminCookie(req,token,maxAge=43200){return ownerCookie(req,token,maxAge).replace('cf_owner=','cf_admin=')}
async function adminSessionActor(s,req,env,requireTotp) {
  const token = adminToken(req);
  if (!token) return null;
  const digest = await hash(token);
  const session = (s.adminSessions || []).find(x => x.hash === digest && x.expires > Date.now());
  const access = session && (s.adminCredentials || []).find(c => c.id === session.adminId);
  if (!access || !adminEmails(env).includes(access.email) || !s.admins.includes(access.id)) return null;
  if (requireTotp) {
    const secret = adminTotpSecret(env, access.email);
    if (!secret || session.totpKey !== await hash(secret)) return null;
  }
  return {id:access.id,email:access.email,name:access.email,adminVerified:true};
}

async function useAdminTotp(state, env, email, code, required) {
  if (!required) return {};
  const secret = adminTotpSecret(env, email);
  if (!secret) return null;
  const step = await matchTotpStep(secret, code);
  if (step === null) return null;
  const totpKey = await hash(secret);
  state.adminTotpSteps ||= {};
  if (step <= (state.adminTotpSteps[totpKey] ?? -1)) return null;
  state.adminTotpSteps[totpKey] = step;
  return {totpKey};
}

function authActor(user){return user?.userId&&user?.email?{id:user.userId,email:user.email.toLowerCase(),name:user.displayName||user.email}:null}
function cookie(req,id){const name='cf_card_'+id;return req.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1)||''}
function setCookie(id, token, req, env) {
  return 'cf_card_'+id+'='+token+'; Path=/; HttpOnly;'+cookieSecurity(req,env)+' SameSite=Lax; Max-Age=31536000';
}
function validId(v){return typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v)}
function plan(tenant){return {total:tenant.totalStamps,milestones:structuredClone(tenant.milestones)}}
function rewards(c){return c.cardProgram.milestones.filter(r=>c.stamps>=r.at&&!c.claimedRewardIds.includes(r.id))}
function addEvent(s,tenant,text,actor){s.events.unshift({id:uid(),cafe:tenant,text,actorId:actor?.id||null,time:new Date().toISOString()});s.events=s.events.slice(0,5000)}
function ownerMembership(s,actor){return actor&&s.ownerRequests.find(r=>r.userId===actor.id&&r.status==='approved')}
function isAdmin(s,actor){return !!actor&&actor.adminVerified===true&&s.admins.includes(actor.id)}
function syncOwners(s,id){let t=s.cafes.find(t=>t.id===id);if(t)t.owner=s.ownerRequests.filter(r=>r.tenantId===id&&r.status==='approved').map(r=>r.name).join(', ')||'Sin dueño aprobado'}
function requireAdmin(s,actor){if(!isAdmin(s,actor))fail('Acceso exclusivo del superadmin.',403)}
function requireOwner(s,actor,local){if(!actor)fail('Iniciá sesión para entrar al panel.',401);let member=ownerMembership(s,actor);if(!member)fail('Tu acceso todavía no fue aprobado por el superadmin.',403);if(local&&local!==member.tenantId)fail('No tenés acceso a ese emprendimiento.',403);let tenant=s.cafes.find(c=>c.id===member.tenantId);if(!tenant)fail('El emprendimiento no existe.',404);return tenant}
async function load(env) {
  if (!env.DB) fail('La base de datos todavía no está conectada.', 503);
  return readState(env.DB, seed);
}

async function change(env, fn) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const row = await load(env);
    const state = JSON.parse(row.document);
    const result = await fn(state);
    if (result?.unchanged || await writeState(env.DB, state, row)) return { state, result };
  }
  fail('Hubo otra operación al mismo tiempo. Volvé a intentarlo.', 409);
}
async function bootstrap(env,actor){let row=await load(env),s=JSON.parse(row.document),allowed=[];try{allowed=JSON.parse(env.SUPERADMIN_EMAILS||'[]')}catch{}if(!Array.isArray(allowed))allowed=[];if(!allowed.length&&env.BOOTSTRAP_OWNER_EMAIL)allowed=[env.BOOTSTRAP_OWNER_EMAIL];allowed=allowed.map(email=>String(email).trim().toLowerCase());if(actor&&allowed.includes(actor.email)&&!s.admins.includes(actor.id)){let result=await change(env,state=>{if(state.admins.includes(actor.id))return {unchanged:true};state.admins.push(actor.id);return {ok:true}});s=result.state}return s}
function publicTenant(t){return {id:t.id,name:t.name,city:t.city,sector:t.sector,active:t.active,cardDesign:t.cardDesign||null,posterDesign:t.posterDesign||null,totalStamps:t.totalStamps,milestones:t.milestones}}
function secureCardURL(env, currentURL, commerce) {
  if (env.CLUB_DOCKER_PREVIEW !== '1' || currentURL.protocol !== 'http:' || !env.PUSH_HTTPS_ORIGIN) return null;
  let target;
  try {
    target = new URL(env.PUSH_HTTPS_ORIGIN);
  } catch {
    return null;
  }
  if (target.protocol !== 'https:' || target.hostname !== currentURL.hostname || target.username || target.password) return null;
  return target.origin+'/?join='+encodeURIComponent(commerce);
}
async function stateFor(s,actor,req,env={}){let url=new URL(req.url),join=url.searchParams.get('join');if(join!==null){if(!validId(join))fail('Este enlace no está disponible.',404);let t=s.cafes.find(c=>c.id===join);if(!t)fail('Este enlace no está disponible.',404);let token=cookie(req,join),digest=token?await hash(token):null,c=s.clients.find(c=>c.cafe===join&&digest&&c.tokenHash===digest);let visible=c?(({tokenHash,...rest})=>rest)(c):null;return {status:'ready',data:{cafes:[publicTenant(t)],clients:visible?[visible]:[],events:[],campaigns:[]},clientId:visible?.id||null,pushPublicKey:visible&&pushConfigured(env)?env.VAPID_PUBLIC_KEY:null,pushSecureCard:visible?secureCardURL(env,url,join):null,personalLink:visible?url.origin+'/?join='+encodeURIComponent(join)+'#card='+token:null}}
if(url.searchParams.get('panel')==='owner'&&url.searchParams.get('login')==='1'){let t=s.cafes.find(t=>t.id===url.searchParams.get('local'));if(!t)fail('El emprendimiento no existe.',404);return {status:'signin',user:null,ownerLoginOnly:true,loginTenant:{id:t.id,name:t.name}}}if(url.searchParams.get('panel')!=='owner'&&(!actor||!isAdmin(s,actor))){if(actor&&s.admins.includes(actor.id)&&!actor.localLogin)return {status:(!(s.adminCredentials||[]).some(c=>c.id===actor.id)||url.searchParams.get('password')==='setup')?'admin-password':'admin-login',user:{name:actor.name,email:actor.email}};if(!actor)return {status:'admin-login',user:null}}if(!actor)return {status:'signin',user:null};let user={name:actor.name,email:actor.email,adminLogin:!!actor.adminVerified};if(url.searchParams.get('panel')!=='owner'){if(!isAdmin(s,actor))return {status:'forbidden',user};return {status:'ready',user,canonicalURL:'/?panel=superadmin',data:{cafes:s.cafes,clients:s.clients.map(({tokenHash,...c})=>c),events:s.events,campaigns:s.campaigns},ownerRequests:s.ownerRequests}}
let request=s.ownerRequests.find(r=>r.userId===actor.id),requested=url.searchParams.get('local');if(isAdmin(s,actor)&&requested&&requested!==request?.tenantId){let tenant=s.cafes.find(t=>t.id===requested);if(!tenant)fail('El emprendimiento no existe.',404);return ownerState(s,actor,tenant,true,env)}if(!request||request.status!=='approved')return {status:request?.status||'request',user,request};let t=requireOwner(s,actor);return ownerState(s,actor,t,false,env)}
function ownerState(s, actor, tenant, readOnly, env) {
  const subscriptions = new Set((s.pushSubscriptions || []).map(entry => entry.clientId));
  return {
    status:'ready',
    user:{name:actor.name,email:actor.email,localLogin:!!actor.localLogin},
    tenantId:tenant.id,
    readOnly,
    pushEnabled:pushConfigured(env),
    canonicalURL:'/?panel=owner&local='+encodeURIComponent(tenant.id),
    data:{
      cafes:[tenant],
      clients:s.clients.filter(c => c.cafe === tenant.id)
        .map(({tokenHash,...client}) => ({...client,pushReady:client.consent && subscriptions.has(client.id)})),
      events:s.events.filter(e => e.cafe === tenant.id),
      campaigns:s.campaigns.filter(c => c.cafe === tenant.id),
    },
  };
}

function designLuminance(color){let values=color.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return values[0]*.2126+values[1]*.7152+values[2]*.0722}
function designContrast(a,b){let x=designLuminance(a),y=designLuminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
function validatePlan(input){let total=Number(input.total),rows=input.milestones;if(!Number.isInteger(total)||total<1||total>50||!Array.isArray(rows)||rows.length<1||rows.length>20)fail('Elegí de 1 a 50 sellos y de 1 a 20 premios.');let ids=new Set(),milestones=rows.map(r=>{let at=Number(r.at),label=clean(r.label,101),id=validId(r.id)?r.id:uid();if(!Number.isInteger(at)||at<1||at>total||!label||label.length>100)fail('Revisá los sellos y las descripciones de los premios.');if(ids.has(id))id=uid();ids.add(id);return{id,at,label}}).sort((a,b)=>a.at-b.at);return {total,milestones}}
function newTenant(input){let p=validatePlan(input.plan||{total:9,milestones:[{id:uid(),at:9,label:sectors[input.sector]||sectors.otro}]}),name=clean(input.name,60),city=clean(input.city,60);if(!name||!city)fail('Completá el nombre del emprendimiento y la ciudad.');return {id:uid(),name,city,sector:Object.hasOwn(sectors,input.sector)?input.sector:'otro',owner:clean(input.owner,80)||'Sin dueño aprobado',active:true,totalStamps:p.total,milestones:p.milestones}}
function cycle(c,t){c.stamps=0;c.claimedRewardIds=[];c.cycle++;c.cardProgram=plan(t)}
function limit(s,key,max,window){let now=Date.now(),entry=s.limits[key];if(!entry||entry.until<now)entry={count:0,until:now+window};if(entry.count>=max)fail('Demasiados intentos. Esperá unos minutos y volvé a intentar.',429);entry.count++;s.limits[key]=entry;for(let k of Object.keys(s.limits))if(s.limits[k].until<now)delete s.limits[k]}
export async function handleAPI(req,env,user,requireTotp=false){try{let trusted=authActor(user),actor=trusted,url=new URL(req.url),path=url.pathname;let s=await bootstrap(env,trusted);actor=await adminSessionActor(s,req,env,requireTotp)||actor;if(url.searchParams.get('password')==='setup'&&url.searchParams.get('panel')!=='owner')actor=trusted;if(url.searchParams.get('panel')==='owner'&&!url.searchParams.has('join'))actor=await sessionActor(s,req)||actor;if(path==='/api/state'&&req.method==='GET')return json({...await stateFor(s,actor,req,env),adminTotpRequired:requireTotp});if(req.method!=='POST')fail('Ruta no disponible.',404);if(req.headers.get('origin')!==url.origin)fail('Origen no permitido.',403);if(Number(req.headers.get('content-length')||0)>20000)fail('Solicitud demasiado grande.',413);let raw=await req.text();if(raw.length>20000)fail('Solicitud demasiado grande.',413);let body;try{body=JSON.parse(raw)}catch{fail('Solicitud inválida.')}if (path === '/api/admin-password' || path === '/api/admin-change-password') {
  const changing = path === '/api/admin-change-password';
  const admin = changing ? actor : trusted;
  if (changing && !admin?.adminVerified) fail('Volvé a iniciar sesión como superadmin.',401);
  if (!admin || !adminEmails(env).includes(admin.email)) fail('Identificá tu cuenta de superadmin con ChatGPT para crear o restablecer tu contraseña.',403);
  const password = String(body.password || '');
  if (password.length < 15 || password.length > 128) fail('La contraseña debe tener entre 15 y 128 caracteres.');
  if (password !== body.confirmPassword) fail('Las contraseñas no coinciden.');
  const salt = uid(), token = changing ? '' : uid()+uid();
  const saved = await change(env, async state => {
    limit(state,'admin-password:'+admin.email,10,3600000);
    if (changing) {
      const current = String(body.currentPassword || '');
      const sessionAdmin = await adminSessionActor(state,req,env,requireTotp);
      if (sessionAdmin?.id !== admin.id) fail('Volvé a iniciar sesión como superadmin.',401);
      const credential = state.adminCredentials.find(entry => entry.id === admin.id);
      if (!current || current.length > 128 || await passwordDigest(current,credential.salt) !== credential.passwordHash) return {denied:true};
      if (current === password) fail('Elegí una contraseña distinta de la actual.');
    } else if (requireTotp && (!env.SUPERADMIN_RECOVERY_KEY || env.SUPERADMIN_RECOVERY_KEY.length < 32
        || await hash(String(body.recoveryKey || '')) !== await hash(env.SUPERADMIN_RECOVERY_KEY))) return {denied:true};
    const factor = await useAdminTotp(state,env,admin.email,body.otp,requireTotp);
    if (!factor) return {denied:true};
    const passwordHash = await passwordDigest(password,salt);
    const revoked = new Set((state.adminCredentials || []).filter(c => c.email === admin.email || c.id === admin.id).map(c => c.id));
    revoked.add(admin.id);
    state.adminCredentials = (state.adminCredentials || []).filter(c => !revoked.has(c.id));
    state.adminCredentials.push({id:admin.id,email:admin.email,salt,passwordHash});
    state.adminSessions = (state.adminSessions || []).filter(x => !revoked.has(x.adminId) && x.expires > Date.now());
    if (token) state.adminSessions.push({hash:await hash(token),adminId:admin.id,expires:Date.now()+43200000,...factor});
    return {ok:true};
  });
  if (saved.result.denied) fail(changing
    ? (requireTotp ? 'La contraseña actual o el código de verificación no son válidos.' : 'La contraseña actual no es válida.')
    : 'La clave de recuperación o el código de verificación no son válidos.',403);
  const verified = changing ? null : {...admin,adminVerified:true};
  return json({...await stateFor(saved.state,verified,new Request(url.origin+'/api/state?panel=superadmin')),adminTotpRequired:requireTotp},200,{
    'set-cookie':changing ? adminCookie(req,'',0) : adminCookie(req,token),
  });
}
if (path === '/api/admin-login') {
  const email = clean(body.email,161).toLowerCase(), password = String(body.password || '');
  if (!email || email.length > 160 || password.length > 128) fail('Credenciales incorrectas.',401);
  const ip = await hash((req.headers.get('cf-connecting-ip') || 'unknown')+':'+(env.RATE_LIMIT_SALT || 'local'));
  const token = uid()+uid(), digest = await hash(token);
  const login = await change(env, async state => {
    limit(state,'admin-login-ip:'+ip,30,900000);
    limit(state,'admin-login-email:'+email,10,900000);
    const access = (state.adminCredentials || []).find(c => c.email === email);
    const candidate = await passwordDigest(password,access?.salt || 'invalid-admin-account');
    if (!access || candidate !== access.passwordHash || !adminEmails(env).includes(email)
        || !state.admins.includes(access.id) || (requireTotp && password.length < 15)) return {denied:true};
    const factor = await useAdminTotp(state,env,email,body.otp,requireTotp);
    if (!factor) return {denied:true};
    state.adminSessions = (state.adminSessions || []).filter(x => x.expires > Date.now()).slice(-999);
    state.adminSessions.push({hash:digest,adminId:access.id,expires:Date.now()+43200000,...factor});
    return {actor:{id:access.id,email,name:email,adminVerified:true}};
  });
  if (login.result.denied) fail('Credenciales o código de verificación incorrectos.',401);
  return json({...await stateFor(login.state,login.result.actor,new Request(url.origin+'/api/state?panel=superadmin')),adminTotpRequired:requireTotp},200,{'set-cookie':adminCookie(req,token)});
}
if(path==='/api/admin-logout'){let token=adminToken(req),digest=token?await hash(token):'';await change(env,state=>{state.adminSessions=(state.adminSessions||[]).filter(x=>x.hash!==digest);return {ok:true}});return json({ok:true},200,{'set-cookie':adminCookie(req,'',0)})}
if(path==='/api/owner-login'){let username=clean(body.username,81).toLowerCase(),password=String(body.password||'');if(!/^[a-z0-9._@+-]{3,80}$/.test(username)||password.length>128)fail('Usuario o contraseña incorrectos.',401);let ip=await hash((req.headers.get('cf-connecting-ip')||'unknown')+':'+(env.RATE_LIMIT_SALT||'local')),token=uid()+uid(),tokenHash=await hash(token);let login=await change(env,async state=>{limit(state,'login-ip:'+ip,30,900000);limit(state,'login-user:'+username,10,900000);let access=(state.ownerCredentials||[]).find(x=>x.username===username),digest=await passwordDigest(password,access?.salt||'invalid-account-salt');if(!access||digest!==access.passwordHash)return {denied:true};let member=state.ownerRequests.find(r=>r.userId===access.id&&r.status==='approved');if(!member||(body.local&&member.tenantId!==body.local))return {denied:true};state.ownerSessions=(state.ownerSessions||[]).filter(x=>x.expires>Date.now()).slice(-999);state.ownerSessions.push({hash:tokenHash,ownerId:access.id,expires:Date.now()+604800000});return {actor:{id:access.id,email:access.username,name:access.name,localLogin:true}}});if(login.result.denied)fail('Usuario o contraseña incorrectos o acceso suspendido.',401);return json(await stateFor(login.state,login.result.actor,new Request(url.origin+'/api/state?panel=owner'),env),200,{'set-cookie':ownerCookie(req,token,undefined,env)})}
if(path==='/api/owner-logout'){let token=req.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('cf_owner='))?.slice(9),digest=token?await hash(token):'';await change(env,state=>{state.ownerSessions=(state.ownerSessions||[]).filter(x=>x.hash!==digest);return {ok:true}});return json({ok:true},200,{'set-cookie':ownerCookie(req,'',0,env)})}
let id=body.local||url.searchParams.get('join');let token=uid()+uid();
if (path === '/api/push-subscription') {
  if (!pushConfigured(env)) fail('El envío de notificaciones no está configurado.', 503);
  if (!validId(id)) fail('El comercio no existe.', 404);
  const cardToken = cookie(req, id);
  if (!cardToken) fail('Abrí tu tarjeta antes de activar avisos.', 401);
  const subscription = pushSubscription(body.subscription);
  if (!subscription) fail('El dispositivo no devolvió una suscripción válida.');
  const tokenHash = await hash(cardToken);
  if (body.check === true) {
    const client = s.clients.find(c => c.cafe === id && c.tokenHash === tokenHash);
    if (!client) fail('Abrí tu tarjeta antes de consultar los avisos.', 401);
    const enabled = client.consent && (s.pushSubscriptions || []).some(entry =>
      entry.clientId === client.id && entry.subscription.endpoint === subscription.endpoint
        && entry.subscription.keys.p256dh === subscription.keys.p256dh
        && entry.subscription.keys.auth === subscription.keys.auth);
    return json({ enabled });
  }
  await change(env, state => {
    const client = state.clients.find(c => c.cafe === id && c.tokenHash === tokenHash);
    if (!client) fail('Abrí tu tarjeta antes de activar avisos.', 401);
    limit(state, 'push-subscribe:'+client.id, 20, 3600000);
    client.consent = true;
    client.consentAt = new Date().toISOString();
    state.pushSubscriptions ||= [];
    state.pushSubscriptions = state.pushSubscriptions.filter(entry =>
      entry.subscription.endpoint !== subscription.endpoint || entry.clientId !== client.id);
    state.pushSubscriptions.push({ clientId: client.id, subscription });
    return { ok:true };
  });
  return json({ ok:true });
}
if(path==='/api/card-session'){if(!validId(id)||typeof body.token!=='string'||body.token.length>150)fail('Enlace de tarjeta inválido.');let digest=await hash(body.token),c=s.clients.find(c=>c.cafe===id&&c.tokenHash===digest);if(!c)fail('Este enlace de tarjeta no es válido.',403);return json({ok:true},200,{'set-cookie':setCookie(id,body.token,req,env)})}
if(path!=='/api/action')fail('Ruta no disponible.',404);let action=body.action,input=body.data||{},key=body.key;if(action==='enroll'){if(typeof input.enrollmentToken!=='string'||!/^[-a-zA-Z0-9]{64,100}$/.test(input.enrollmentToken))fail('Falta el identificador seguro de la tarjeta.');token=input.enrollmentToken;}if(!validId(key))fail('Falta el identificador de la operación.');let actionKey=(actor?.id||'public')+':'+action+':'+key,digest=await hash(token),ipKey=await hash((req.headers.get('cf-connecting-ip')||'unknown')+':'+(env.RATE_LIMIT_SALT||'local'));let result=await change(env,async state=>{if(state.operations.includes(actionKey))return {unchanged:true,duplicate:true};let out={};
if(action==='request-owner'){if(!actor)fail('Iniciá sesión para solicitar acceso.',401);let r=state.ownerRequests.find(r=>r.userId===actor.id);if(r&&['approved','pending','suspended'].includes(r.status))fail('Ya tenés una solicitud registrada.');let businessName=clean(input.businessName,60),city=clean(input.city,60),name=clean(input.name,80);if(!businessName||!city||!name)fail('Completá tu nombre, el emprendimiento y la ciudad.');limit(state,'request:'+actor.id,3,86400000);let request={id:r?.id||uid(),userId:actor.id,email:actor.email,name,businessName,city,sector:Object.hasOwn(sectors,input.sector)?input.sector:'otro',status:'pending',createdAt:new Date().toISOString()};if(r)Object.assign(r,request);else state.ownerRequests.push(request)}
else if(action==='add-owner'){requireAdmin(state,actor);let t=state.cafes.find(t=>t.id===input.tenantId);if(!t)fail('El emprendimiento no existe.',404);let name=clean(input.name,81),username=clean(input.username,81).toLowerCase(),password=String(input.password||'');if(!name||name.length>80)fail('Ingresá el nombre del dueño, hasta 80 caracteres.');if(!/^[a-z0-9._@+-]{3,80}$/.test(username))fail('El usuario debe tener entre 3 y 80 caracteres: letras, números, punto, guion o email.');if(password.length<10||password.length>128)fail('La contraseña debe tener entre 10 y 128 caracteres.');state.ownerCredentials||=[];if(state.ownerCredentials.some(c=>c.username===username))fail('Ese usuario ya existe. Elegí otro.',409);let ownerId='owner-'+uid(),salt=uid();state.ownerCredentials.push({id:ownerId,username,name,salt,passwordHash:await passwordDigest(password,salt)});state.ownerRequests.push({id:uid(),userId:ownerId,email:username,name,businessName:t.name,city:t.city,sector:t.sector,tenantId:t.id,assignedTenantId:t.id,status:'pending',createdAt:new Date().toISOString(),createdBy:actor.id});addEvent(state,t.id,'Solicitud de dueño agregada para '+name+' · pendiente de aprobación',actor)}
else if(action==='delete-owner'){requireAdmin(state,actor);let r=state.ownerRequests.find(r=>r.id===input.requestId);if(!r)fail('La solicitud no existe.',404);state.ownerRequests=state.ownerRequests.filter(x=>x.id!==r.id);state.ownerCredentials=(state.ownerCredentials||[]).filter(x=>x.id!==r.userId);state.ownerSessions=(state.ownerSessions||[]).filter(x=>x.ownerId!==r.userId);if(r.tenantId){let t=state.cafes.find(x=>x.id===r.tenantId);if(t)syncOwners(state,t.id);addEvent(state,r.tenantId,'Solicitud y acceso de dueño eliminados para '+r.name,actor)}}
else if(['approve-owner','reject-owner','suspend-owner'].includes(action)){requireAdmin(state,actor);let r=state.ownerRequests.find(r=>r.id===input.requestId);if(!r)fail('La solicitud no existe.',404);if(action==='approve-owner'){if(!['pending','suspended'].includes(r.status))fail('La solicitud ya fue resuelta.',409);if(r.assignedTenantId&&input.tenantId&&input.tenantId!==r.assignedTenantId)fail('Esta solicitud corresponde a otro comercio.',403);let tenantId=r.assignedTenantId||input.tenantId;let t=tenantId?state.cafes.find(c=>c.id===tenantId):null;if(tenantId&&!t)fail('El emprendimiento no existe.');if(!t){t=newTenant({name:r.businessName,city:r.city,sector:r.sector,owner:r.name});state.cafes.push(t)}r.tenantId=t.id;r.status='approved';syncOwners(state,t.id);addEvent(state,t.id,'Acceso de dueño aprobado para '+r.name,actor)}else{r.status=action==='reject-owner'?'rejected':'suspended';if(r.tenantId)addEvent(state,r.tenantId,'Acceso de dueño '+r.status,actor)}if(r.tenantId)syncOwners(state,r.tenantId);r.reviewedAt=new Date().toISOString();r.reviewedBy=actor.id}
else if(action==='poster-design'){requireAdmin(state,actor);let t=state.cafes.find(t=>t.id===input.tenantId);if(!t)fail('El emprendimiento no existe.',404);let d=input.design;if(!d||typeof d!=='object')fail('Falta el diseño del cartel.');for(let key of ['background','text','accent'])if(typeof d[key]!=='string'||!/^#[0-9a-f]{6}$/i.test(d[key]))fail('Elegí colores válidos para el cartel.');if(designContrast(d.background,d.text)<4.5)fail('Elegí colores de fondo y texto con más contraste.');if(!['modern','classic','rounded'].includes(d.font))fail('Elegí una tipografía de la lista.');let title=clean(d.title,101),subtitle=clean(d.subtitle,141),cta=clean(d.cta,61),footer=clean(d.footer,121),rewardText=Object.hasOwn(d,'rewardText')?clean(d.rewardText,201):t.posterDesign?.rewardText;if(!title||!cta||title.length>100||subtitle.length>140||cta.length>60||footer.length>120||(rewardText!==undefined&&rewardText.length>200))fail('Revisá los textos del cartel.');t.posterDesign={background:d.background.toLowerCase(),text:d.text.toLowerCase(),accent:d.accent.toLowerCase(),font:d.font,title,subtitle,cta,footer,...(rewardText!==undefined?{rewardText}:{})};addEvent(state,t.id,'Diseño de cartel de inscripción actualizado por superadmin',actor)}
else if(action==='card-design'){requireAdmin(state,actor);let t=state.cafes.find(t=>t.id===input.tenantId);if(!t)fail('El emprendimiento no existe.',404);let d=input.design;if(!d||typeof d!=='object')fail('Falta el diseño de la tarjeta.');for(let key of ['background','text','accent'])if(typeof d[key]!=='string'||!/^#[0-9a-f]{6}$/i.test(d[key]))fail('Elegí colores válidos para la tarjeta.');if(designContrast(d.background,d.text)<4.5)fail('Elegí colores de fondo y texto con más contraste.');let title=clean(d.title,61),tagline=clean(d.tagline,51),icon=clean(d.icon,13);if(title.length>60||tagline.length>50||icon.length>12||!['circle','rounded'].includes(d.shape))fail('Revisá los textos y la forma de los sellos.');t.cardDesign={background:d.background.toLowerCase(),text:d.text.toLowerCase(),accent:d.accent.toLowerCase(),title,tagline,icon,shape:d.shape};addEvent(state,t.id,'Diseño de tarjeta actualizado por superadmin',actor)}
else if(action==='create-business'){requireAdmin(state,actor);let t=newTenant(input),username=clean(input.username,81).toLowerCase(),password=String(input.password||'');if(!/^[a-z0-9._@+-]{3,80}$/.test(username))fail('El usuario debe tener entre 3 y 80 caracteres: letras, números, punto, guion o email.');if(password.length<10||password.length>128)fail('La contraseña debe tener entre 10 y 128 caracteres.');state.ownerCredentials||=[];if(state.ownerCredentials.some(x=>x.username===username))fail('Ese usuario ya existe. Elegí otro.',409);let ownerId='owner-'+uid(),salt=uid(),passwordHash=await passwordDigest(password,salt);state.ownerCredentials.push({id:ownerId,username,name:t.owner,salt,passwordHash});state.ownerRequests.push({id:uid(),userId:ownerId,email:username,name:t.owner,businessName:t.name,city:t.city,sector:t.sector,tenantId:t.id,status:'approved',createdAt:new Date().toISOString(),reviewedAt:new Date().toISOString(),reviewedBy:actor.id});state.cafes.push(t);addEvent(state,t.id,'Emprendimiento creado con acceso de dueño',actor)}
else if(action==='delete-business'){requireAdmin(state,actor);let t=state.cafes.find(c=>c.id===input.id);if(!t)fail('El emprendimiento no existe.',404);if(input.confirmName!==t.name)fail('Escribí el nombre exacto del comercio para confirmar la eliminación.');let ownerIds=new Set(state.ownerRequests.filter(r=>r.tenantId===t.id).map(r=>r.userId));state.cafes=state.cafes.filter(c=>c.id!==t.id);state.clients=state.clients.filter(c=>c.cafe!==t.id);if(state.pushSubscriptions){const retainedClients=new Set(state.clients.map(c=>c.id));state.pushSubscriptions=state.pushSubscriptions.filter(entry=>retainedClients.has(entry.clientId))}state.events=state.events.filter(e=>e.cafe!==t.id);state.campaigns=state.campaigns.filter(c=>c.cafe!==t.id);state.ownerRequests=state.ownerRequests.filter(r=>r.tenantId!==t.id);state.ownerCredentials=(state.ownerCredentials||[]).filter(c=>!ownerIds.has(c.id));state.ownerSessions=(state.ownerSessions||[]).filter(s=>!ownerIds.has(s.ownerId))}
else if(action==='toggle-business'){requireAdmin(state,actor);let t=state.cafes.find(c=>c.id===input.id);if(!t)fail('El emprendimiento no existe.',404);t.active=!t.active;addEvent(state,t.id,t.active?'Local activado':'Local pausado',actor)}
else if(action==='enroll'){if(!validId(id))fail('El local no existe.',404);let t=state.cafes.find(c=>c.id===id);if(!t||!t.active)fail('Las inscripciones de este local no están disponibles.',403);let name=clean(input.name,80),email=clean(input.email,160).toLowerCase();if(!name||!/^\S+@\S+\.\S+$/.test(email))fail('Ingresá un nombre y email válidos.');limit(state,'enroll:'+ipKey,10,600000);if(state.clients.some(c=>c.cafe===id&&c.email===email))fail('Ese email ya tiene una tarjeta. Abrí tu enlace personal o pedí ayuda al local.',409);let c={id:'CF-'+uid(),cafe:id,name,email,consent:input.consent===true,consentAt:new Date().toISOString(),stamps:0,rewards:0,visitTotal:0,cycle:1,claimedRewardIds:[],rewardHistory:[],cardProgram:plan(t),tokenHash:digest};state.clients.push(c);out.enrolled=id;addEvent(state,id,'Se sumó '+name+' al club',null)}
else{let t=requireOwner(state,actor,id);if(!t.active)fail('El local está pausado.',403);let c=input.clientId?state.clients.find(c=>c.id===input.clientId&&c.cafe===t.id):null;
if(action==='stamp'){if(!c)fail('Cliente no disponible.',404);if(c.stamps>=c.cardProgram.total)fail('La tarjeta ya está completa.');c.stamps++;c.visitTotal++;addEvent(state,t.id,'Sello agregado a '+c.name+' · '+c.stamps+'/'+c.cardProgram.total,actor)}
else if(action==='unstamp'){if(!c)fail('Cliente no disponible.',404);if(c.stamps<=0)fail('La tarjeta no tiene sellos para quitar.');let floor=Math.max(0,...c.cardProgram.milestones.filter(r=>c.claimedRewardIds.includes(r.id)).map(r=>r.at));if(c.stamps-1<floor)fail('No podés quitar sellos que respaldan un premio ya canjeado.',409);c.stamps--;c.visitTotal=Math.max(0,c.visitTotal-1);addEvent(state,t.id,'Sello quitado por corrección a '+c.name+' · '+c.stamps+'/'+c.cardProgram.total,actor)}
else if(action==='redeem'){if(!c)fail('Cliente no disponible.',404);let r=rewards(c).find(r=>r.id===input.rewardId);if(!r)fail('Ese premio no está disponible o ya fue canjeado.',409);c.claimedRewardIds.push(r.id);c.rewards++;c.rewardHistory.push({rewardId:r.id,label:r.label,at:r.at,cycle:c.cycle,time:new Date().toISOString()});if(c.stamps>=c.cardProgram.total&&!rewards(c).length)cycle(c,t);addEvent(state,t.id,'Premio «'+r.label+'» canjeado por '+c.name,actor)}
else if(action==='restart'){if(!c||c.stamps<c.cardProgram.total||rewards(c).length)fail('La tarjeta no puede reiniciarse todavía.');cycle(c,t);addEvent(state,t.id,'Nuevo ciclo para '+c.name,actor)}
else if(action==='program'){let p=validatePlan(input.plan);t.totalStamps=p.total;t.milestones=p.milestones;if(Object.hasOwn(sectors,input.sector))t.sector=input.sector;for(let client of state.clients.filter(c=>c.cafe===t.id))if(client.stamps===0&&!rewards(client).length)client.cardProgram=plan(t);addEvent(state,t.id,'Programa actualizado',actor)}
else if (action === 'campaign') {
  const ids = Array.isArray(input.recipientIds) ? [...new Set(input.recipientIds)] : [];
  const message = clean(input.message, 501);
  if (!ids.length || !message || message.length > 500) fail('Seleccioná clientes y escribí un mensaje de hasta 500 caracteres.');
  const recipients = ids.map(id => state.clients.find(c => c.id === id && c.cafe === t.id && c.consent));
  if (recipients.some(c => !c)) fail('Solo podés seleccionar clientes de tu local con consentimiento.', 403);
  const campaign = { id:uid(), cafe:t.id, message, count:recipients.length, recipients:recipients.map(c=>({id:c.id,name:c.name})), time:new Date().toISOString() };
  if (pushConfigured(env)) {
    const subscriptions = (state.pushSubscriptions || []).filter(entry => ids.includes(entry.clientId));
    if (!subscriptions.length) fail('Ningún cliente seleccionado activó avisos en su teléfono.');
    if (subscriptions.length > 20) fail('Elegí hasta 20 dispositivos por envío.');
    campaign.delivery = { status:'sending' };
    out.push = { campaignId:campaign.id, subscriptions, data:{ title:t.name, body:message, url:'/?join='+encodeURIComponent(t.id) } };
  }
  state.campaigns.unshift(campaign);
}else fail('Operación no disponible.',404)}
state.operations.push(actionKey);state.operations=state.operations.slice(-2000);return out});let headers={},stateReq=req;if(action==='enroll'&&result.state.clients.some(c=>c.cafe===id&&c.tokenHash===digest))result.result.enrolled=id;if(result.result.enrolled){headers['set-cookie']=setCookie(result.result.enrolled,token,req,env);let h=new Headers(req.headers);h.set('cookie',(h.get('cookie')||'').split(';').map(v=>v.trim()).filter(v=>v&&!v.startsWith('cf_card_'+result.result.enrolled+'=')).concat('cf_card_'+result.result.enrolled+'='+token).join('; '));stateReq=new Request(req.url,{headers:h})}if (result.result.push) {
  const { campaignId, subscriptions, data } = result.result.push;
  const outcomes = await Promise.all(subscriptions.map(entry => sendPush(entry.subscription, data, env)));
  const accepted = outcomes.filter(outcome => outcome === 'accepted').length;
  const saved = await change(env, state => {
    const campaign = state.campaigns.find(c => c.id === campaignId);
    if (campaign) campaign.delivery = { status:'complete', accepted, failed:outcomes.length-accepted };
    state.pushSubscriptions = (state.pushSubscriptions || []).filter(entry =>
      !subscriptions.some((sent, index) => outcomes[index] === 'expired' && sent.clientId === entry.clientId
        && sent.subscription.endpoint === entry.subscription.endpoint));
    return { ok:true };
  });
  result.state = saved.state;
}
return json(await stateFor(result.state,actor,stateReq,env),200,headers)
}catch(e){return json({error:e instanceof Fault?e.message:'No se pudo completar la operación. Intentá nuevamente.'},e instanceof Fault?e.status:500)}}
