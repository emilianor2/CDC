import {DatabaseSync} from 'node:sqlite';import assert from 'node:assert/strict';import fs from 'node:fs';import {handleAPI} from './backend.mjs';
const sql=new DatabaseSync(':memory:'),dir=new URL('../drizzle/',import.meta.url);for (const migration of fs.readdirSync(dir).filter(name => name.endsWith('.sql')).sort()) {
  sql.exec(fs.readFileSync(new URL(migration, dir), 'utf8'));
}

const env={BOOTSTRAP_OWNER_EMAIL:'admin@example.com'};
env.DB={prepare:q=>({bind:(...a)=>({first:async()=>sql.prepare(q).get(...a),run:async()=>({meta:{changes:Number(sql.prepare(q).run(...a).changes)}})})})};
const admin={userId:'admin',email:'admin@example.com'},owner={userId:'owner',email:'owner@example.com'},other={userId:'other',email:'other@example.com'};
const regressionAdminCookies=new Map();
async function req(path,user,body,cookie='',origin='https://club.test',requestOrigin='https://club.test'){let allowed=env.SUPERADMIN_EMAILS?JSON.parse(env.SUPERADMIN_EMAILS):[env.BOOTSTRAP_OWNER_EMAIL];if(user&&allowed.includes(user.email)){if(!regressionAdminCookies.has(user.userId)){let setup=await handleAPI(new Request('https://club.test/api/admin-password',{method:'POST',headers:{origin:'https://club.test','content-type':'application/json'},body:JSON.stringify({password:'RegressionAdmin2026!',confirmPassword:'RegressionAdmin2026!'})}),env,user);assert.equal(setup.status,200);regressionAdminCookies.set(user.userId,setup.headers.get('set-cookie').split(';')[0])}cookie=[cookie,regressionAdminCookies.get(user.userId)].filter(Boolean).join('; ')}let r=await handleAPI(new Request(requestOrigin+path,{method:body?'POST':'GET',headers:{...(body?{origin,'content-type':'application/json'}:{}),cookie},body:body?JSON.stringify(body):undefined}),env,user);return{status:r.status,d:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0],setCookie:r.headers.get('set-cookie')}}
const act=(action,data,user=admin,local,key=crypto.randomUUID(),query='?panel=superadmin')=>req('/api/action'+query,user,{action,data,local,key});
assert.equal((await req('/api/state?panel=superadmin')).d.status,'admin-login');assert.equal((await req('/api/state?panel=superadmin',admin)).d.status,'ready');assert.equal((await req('/api/state?panel=superadmin',other)).d.status,'forbidden');await act('request-owner',{name:'Ana',businessName:'Barbería',city:'Mendoza',sector:'barberia'},owner,undefined,undefined,'?panel=owner');assert.equal((await req('/api/state?panel=owner',owner)).d.status,'pending');assert.equal((await act('stamp',{clientId:'x'},owner,'central')).status,403);let rid=(await req('/api/state?panel=superadmin',admin)).d.ownerRequests[0].id;assert.equal((await act('approve-owner',{requestId:rid},owner)).status,403);await act('approve-owner',{requestId:rid});let tenant=(await req('/api/state?panel=owner',owner)).d.tenantId;assert(tenant);let canonical=(await req('/api/state?panel=owner&local=central',owner));assert.equal(canonical.status,200);assert.equal(canonical.d.tenantId,tenant);assert.equal(canonical.d.data.cafes.length,1);assert.equal(canonical.d.data.cafes[0].id,tenant);assert(canonical.d.canonicalURL.endsWith(tenant));
let token=crypto.randomUUID()+crypto.randomUUID(),body={action:'enroll',local:tenant,key:crypto.randomUUID(),data:{name:'Fan',email:'fan@example.com',consent:true,enrollmentToken:token}};let enrolled=await req('/api/action?join='+tenant,null,body);assert.equal(enrolled.status,200);let cookie=enrolled.cookie,cid=enrolled.d.clientId;assert(cookie&&cid);assert.equal((await req('/api/action?join='+tenant,null,body)).d.clientId,cid);assert.equal((await req('/api/state?join='+tenant)).d.data.clients.length,0);assert.equal((await req('/api/state?join='+tenant,null,null,cookie)).d.clientId,cid);assert.equal((await req('/api/state?join=central',null,null,cookie)).d.data.clients.length,0);assert(!JSON.stringify(enrolled.d).includes('tokenHash'));
const lanOrigin = 'http://192.168.1.20:5173';
const cardSessionPath = '/api/card-session';
const cardSession = { local: tenant, token };
assert.match(enrolled.setCookie, /; Secure;/);
const nonPreviewSession = await req(cardSessionPath, null, cardSession, '', lanOrigin, lanOrigin);
assert.equal(nonPreviewSession.status, 200, nonPreviewSession.d.error);
assert.match(nonPreviewSession.setCookie, /; Secure;/);
env.CLUB_DOCKER_PREVIEW = '1';
const lanEnrollment = await req('/api/action?join='+tenant, null, body, '', lanOrigin, lanOrigin);
assert.equal(lanEnrollment.d.clientId, cid);
assert.doesNotMatch(lanEnrollment.setCookie, /; Secure;/);
const lanSession = await req(cardSessionPath, null, cardSession, '', lanOrigin, lanOrigin);
assert.match(lanSession.setCookie, /; HttpOnly;/);
assert.doesNotMatch(lanSession.setCookie, /; Secure;/);
assert.equal((await req('/api/state?join='+tenant, null, null, lanSession.cookie, lanOrigin, lanOrigin)).d.clientId, cid);
assert.match((await req(cardSessionPath, null, cardSession)).setCookie, /; Secure;/);
delete env.CLUB_DOCKER_PREVIEW;

let k=crypto.randomUUID();await Promise.all([act('stamp',{clientId:cid},owner,tenant,k),act('stamp',{clientId:cid},owner,tenant,k)]);assert.equal((await req('/api/state?join='+tenant,null,null,cookie)).d.data.clients[0].stamps,1);assert.equal((await act('stamp',{clientId:cid},other,tenant)).status,403);assert.equal((await act('stamp',{clientId:cid},owner,'central')).status,403);assert.equal((await act('stamp',{clientId:cid},null,tenant)).status,401);assert.equal((await req('/api/action',owner,{action:'stamp',data:{clientId:cid},local:tenant,key:crypto.randomUUID()},'','https://evil.test')).status,403);
await act('program',{plan:{total:4,milestones:[{id:'two',at:2,label:'Descuento'},{id:'four',at:4,label:'Corte'}]}},owner,tenant);for(let i=0;i<8;i++)await act('stamp',{clientId:cid},owner,tenant);let card=(await req('/api/state?join='+tenant,null,null,cookie)).d.data.clients[0];assert.equal(card.cardProgram.total,9);await act('redeem',{clientId:cid,rewardId:card.cardProgram.milestones[0].id},owner,tenant);for(let i=0;i<2;i++)await act('stamp',{clientId:cid},owner,tenant);await act('redeem',{clientId:cid,rewardId:'two'},owner,tenant);assert.equal((await act('redeem',{clientId:cid,rewardId:'two'},owner,tenant)).status,409);card=(await req('/api/state?join='+tenant,null,null,cookie)).d.data.clients[0];assert.equal(card.stamps,2);assert.equal(card.rewards,2);assert.equal((await act('campaign',{recipientIds:[cid],message:'Hola'},owner,tenant)).status,200);assert.equal((await act('campaign',{recipientIds:['bad'],message:'Hola'},owner,tenant)).status,403);
assert.equal((await req('/api/card-session',null,{local:tenant,token})).status,200);assert.equal((await req('/api/card-session',null,{local:tenant,token:'bad'})).status,403);await act('suspend-owner',{requestId:rid});assert.equal((await req('/api/state?panel=owner',owner)).d.status,'suspended');assert.equal((await act('stamp',{clientId:cid},owner,tenant)).status,403);await act('approve-owner',{requestId:rid,tenantId:tenant});assert.equal((await req('/api/state?panel=owner',owner)).d.status,'ready');let all=(await req('/api/state?panel=superadmin',admin)).d;assert.equal(all.data.clients.length,1);assert(!JSON.stringify(all).includes(token));assert.equal(sql.prepare('select count(*) as n from app_state').get().n,1);console.log('PASS: real SQLite; owner approval/suspension; server permissions; private cards; recovery; shared stamps; idempotency/concurrency; tenant isolation; CSRF; configurable rewards.');

env.SUPERADMIN_EMAILS=JSON.stringify(['admin@example.com','second@example.com']);let secondAdmin={userId:'second-admin',email:'second@example.com'};assert.equal((await req('/api/state?panel=superadmin',secondAdmin)).d.status,'ready');assert.equal((await req('/api/state?panel=superadmin',admin)).d.status,'ready');assert.equal((await req('/api/state?panel=superadmin',other)).d.status,'forbidden');console.log('PASS: two explicitly allowlisted superadmins; existing access retained; unauthorized account rejected.');

let adminView=await req('/api/state?panel=owner&local=central',admin);assert.equal(adminView.d.status,'ready');assert.equal(adminView.d.readOnly,true);assert.equal(adminView.d.tenantId,'central');let outsiderView=await req('/api/state?panel=owner&local=central',other);assert.equal(outsiderView.d.status,'request');assert.equal((await req('/api/state?panel=owner&local=missing',admin)).status,404);console.log('PASS: stale owner link resolves exclusively to approved tenant; superadmin can consult another panel; unapproved users remain blocked; cross-tenant writes still rejected.');
// Correcting stamps must preserve already-redeemed rewards and remain tenant-scoped.
let beforeCorrection=(await req('/api/state?join='+tenant,null,null,cookie)).d.data.clients[0];assert.equal(beforeCorrection.stamps,2);assert.equal((await act('unstamp',{clientId:cid},owner,tenant)).status,409);await act('stamp',{clientId:cid},owner,tenant);let undoKey=crypto.randomUUID();await Promise.all([act('unstamp',{clientId:cid},owner,tenant,undoKey),act('unstamp',{clientId:cid},owner,tenant,undoKey)]);let corrected=(await req('/api/state?join='+tenant,null,null,cookie)).d.data.clients[0];assert.equal(corrected.stamps,2);assert.equal(corrected.rewards,beforeCorrection.rewards);assert.equal(corrected.visitTotal,beforeCorrection.visitTotal);assert.equal((await act('unstamp',{clientId:cid},other,tenant)).status,403);assert.equal((await act('unstamp',{clientId:cid},owner,'central')).status,403);assert.equal((await act('unstamp',{clientId:cid},null,tenant)).status,401);
let token2=crypto.randomUUID()+crypto.randomUUID();let enrolled2=await req('/api/action?join='+tenant,null,{action:'enroll',local:tenant,key:crypto.randomUUID(),data:{name:'Corrección',email:'correction@example.com',consent:false,enrollmentToken:token2}});let cid2=enrolled2.d.clientId,cookie2=enrolled2.cookie;await act('stamp',{clientId:cid2},owner,tenant);await act('stamp',{clientId:cid2},owner,tenant);await act('unstamp',{clientId:cid2},owner,tenant);let pending=(await req('/api/state?join='+tenant,null,null,cookie2)).d.data.clients[0];assert.equal(pending.stamps,1);assert.equal((await act('redeem',{clientId:cid2,rewardId:'two'},owner,tenant)).status,409);await act('unstamp',{clientId:cid2},owner,tenant);assert.equal((await act('unstamp',{clientId:cid2},owner,tenant)).status,400);let empty=(await req('/api/state?join='+tenant,null,null,cookie2)).d.data.clients[0];assert.equal(empty.stamps,0);assert.equal(empty.visitTotal,0);let audit=(await req('/api/state?panel=superadmin',admin)).d.data.events;assert(audit.some(e=>e.text.includes('Sello quitado por corrección')&&e.actorId===owner.userId));console.log('PASS: stamp removal, reward consistency, zero floor, idempotent retries, shared client update, audit log and owner-only tenant authorization.');

const theme={background:'#f2e9da',text:'#243d32',accent:'#d39b5b',title:'Club de la barbería',tagline:'BIENVENIDOS',icon:'✂',shape:'rounded'};assert.equal((await act('card-design',{tenantId:tenant,design:theme},owner)).status,403);assert.equal((await act('card-design',{tenantId:tenant,design:theme},null)).status,403);assert.equal((await act('card-design',{tenantId:tenant,design:theme})).status,200);let themed=(await req('/api/state?join='+tenant)).d.data.cafes[0];assert.deepEqual(themed.cardDesign,theme);assert.equal((await req('/api/state?panel=owner',owner)).d.data.cafes[0].cardDesign.title,theme.title);let anonOther=(await req('/api/state?join=central')).d.data.cafes[0];assert.equal(anonOther.cardDesign,null);let beforeBad=JSON.stringify(themed.cardDesign);for(const bad of [{...theme,background:'red;display:none'},{...theme,text:'#f2e9da'},{...theme,shape:'<script>'},{...theme,title:'x'.repeat(61)}]){assert.equal((await act('card-design',{tenantId:tenant,design:bad})).status,400);assert.equal(JSON.stringify((await req('/api/state?join='+tenant)).d.data.cafes[0].cardDesign),beforeBad)}assert.equal((await act('card-design',{tenantId:'unknown',design:theme})).status,404);assert((await req('/api/state?panel=superadmin',admin)).d.data.events.some(e=>e.cafe===tenant&&e.text.includes('Diseño de tarjeta actualizado')&&e.actorId===admin.userId));console.log('PASS: admin-only design write; public/owner card appearance; per-business isolation; hex/text/contrast validation; design audit.');

const posterTheme={background:'#22283b',text:'#ffffff',accent:'#a7c8e8',font:'rounded',title:'Sumate al club',subtitle:'Tu próxima visita tiene premio',cta:'Escaneá para inscribirte',footer:'Te esperamos'};assert.equal((await act('poster-design',{tenantId:tenant,design:posterTheme},owner)).status,403);assert.equal((await act('poster-design',{tenantId:tenant,design:posterTheme},null)).status,403);assert.equal((await act('poster-design',{tenantId:tenant,design:posterTheme})).status,200);assert.deepEqual((await req('/api/state?join='+tenant)).d.data.cafes[0].posterDesign,posterTheme);assert.deepEqual((await req('/api/state?panel=owner',owner)).d.data.cafes[0].posterDesign,posterTheme);assert.equal((await req('/api/state?join=central')).d.data.cafes[0].posterDesign,null);for(const bad of [{...posterTheme,background:'red;display:none'},{...posterTheme,text:'#22283b'},{...posterTheme,font:'url(evil)'},{...posterTheme,title:''},{...posterTheme,cta:''},{...posterTheme,title:'x'.repeat(101)}]){assert.equal((await act('poster-design',{tenantId:tenant,design:bad})).status,400);assert.deepEqual((await req('/api/state?join='+tenant)).d.data.cafes[0].posterDesign,posterTheme)}assert.equal((await act('poster-design',{tenantId:'unknown',design:posterTheme})).status,404);console.log('PASS: admin-only poster changes, per-business storage, public and owner propagation, contrast/font/text validation.');
let phraseTheme={...posterTheme,rewardText:'Cada visita suma una sorpresa'};assert.equal((await act('poster-design',{tenantId:tenant,design:phraseTheme},owner)).status,403);assert.equal((await act('poster-design',{tenantId:tenant,design:phraseTheme})).status,200);assert.equal((await req('/api/state?join='+tenant)).d.data.cafes[0].posterDesign.rewardText,phraseTheme.rewardText);assert.equal((await act('poster-design',{tenantId:tenant,design:{...phraseTheme,rewardText:'x'.repeat(201)}})).status,400);assert.equal((await act('poster-design',{tenantId:tenant,design:posterTheme})).status,200);assert.equal((await req('/api/state?join='+tenant)).d.data.cafes[0].posterDesign.rewardText,phraseTheme.rewardText);await act('poster-design',{tenantId:tenant,design:{...posterTheme,rewardText:''}});assert.equal((await req('/api/state?join='+tenant)).d.data.cafes[0].posterDesign.rewardText,'');console.log('PASS: custom reward phrase persists, remains admin-only, validates length, supports hiding and survives saves from older clients.');
// Credentials provisioned only by superadmin; cookie sessions stay isolated from admin and other tenants.
const provision={name:'Local con acceso',city:'Mendoza',owner:'Dueño nuevo',sector:'bar',username:'local.nuevo',password:'UnaClaveSegura2026!'};
assert.equal((await act('create-business',provision,owner)).status,403);
assert.equal((await act('create-business',{...provision,password:'corta'})).status,400);
let createdAccess=await act('create-business',provision);assert.equal(createdAccess.status,200);let newLocal=createdAccess.d.data.cafes.find(x=>x.name===provision.name).id;
assert(!JSON.stringify(createdAccess.d).includes(provision.password));assert(!JSON.stringify(createdAccess.d).includes('passwordHash'));assert(!JSON.stringify(createdAccess.d).includes('ownerSessions'));
assert.equal((await act('create-business',{...provision,username:'LOCAL.NUEVO'})).status,409);
assert.equal((await req('/api/owner-login?panel=owner',null,{username:provision.username,password:'incorrecta'})).status,401);
let logged=await req('/api/owner-login?panel=owner',null,{username:'LOCAL.NUEVO',password:provision.password});assert.equal(logged.status,200);assert(logged.cookie);assert.equal(logged.d.tenantId,newLocal);assert.equal(logged.d.data.cafes.length,1);assert.equal(logged.d.user.localLogin,true);
assert.equal((await req('/api/state?panel=owner&local=central',null,null,logged.cookie)).d.tenantId,newLocal);
assert.equal((await req('/api/state?panel=superadmin',null,null,logged.cookie)).d.status,'admin-login');
assert.equal((await req('/api/action?panel=owner',null,{action:'stamp',local:tenant,data:{clientId:cid},key:crypto.randomUUID()},logged.cookie)).status,403);
let newCard=await req('/api/action?join='+newLocal,null,{action:'enroll',local:newLocal,key:crypto.randomUUID(),data:{name:'Nuevo fan',email:'newfan@example.com',enrollmentToken:crypto.randomUUID()+crypto.randomUUID()}});
assert.equal((await req('/api/action?panel=owner',null,{action:'stamp',local:newLocal,data:{clientId:newCard.d.clientId},key:crypto.randomUUID()},logged.cookie)).status,200);
let newRequest=createdAccess.d.ownerRequests.find(x=>x.tenantId===newLocal);await act('suspend-owner',{requestId:newRequest.id});assert.equal((await req('/api/state?panel=owner',null,null,logged.cookie)).d.status,'suspended');await act('approve-owner',{requestId:newRequest.id,tenantId:newLocal});
assert.equal((await req('/api/owner-logout',null,{},logged.cookie)).status,200);assert.equal((await req('/api/state?panel=owner',null,null,logged.cookie)).d.status,'signin');
const stored=JSON.parse(sql.prepare('select document from estado_aplicacion').get().document);assert(!JSON.stringify(stored).includes(provision.password));assert(stored.ownerCredentials[0].passwordHash);assert(!stored.ownerSessions.length);
for(let i=0;i<8;i++)assert.equal((await req('/api/owner-login?panel=owner',null,{username:provision.username,password:'incorrecta'})).status,401);assert.equal((await req('/api/owner-login?panel=owner',null,{username:provision.username,password:'incorrecta'})).status,429);
console.log('PASS: admin provisioning, salted password hashing, duplicate usernames, login/logout, persisted rate limits, suspension, protected sessions and tenant isolation.');
// Deletion is admin-only, revokes active credentials/sessions and preserves business records.
let deletionProvision={...provision,name:'Conservar comercio',username:'delete.test'};let deletionCreated=await act('create-business',deletionProvision);let deletionRequest=deletionCreated.d.ownerRequests.find(x=>x.email==='delete.test'),deletionTenant=deletionRequest.tenantId;
let deletionLogin=await req('/api/owner-login?panel=owner',null,{username:'delete.test',password:provision.password});assert.equal(deletionLogin.status,200);
let retainedCard=await req('/api/action?join='+deletionTenant,null,{action:'enroll',local:deletionTenant,key:crypto.randomUUID(),data:{name:'Fan conservado',email:'keep@example.com',enrollmentToken:crypto.randomUUID()+crypto.randomUUID()}});
for(let unauthorized of [owner,other,null])assert.equal((await act('delete-owner',{requestId:deletionRequest.id},unauthorized)).status,403);
let deletionKey=crypto.randomUUID();let deleted=await act('delete-owner',{requestId:deletionRequest.id},admin,undefined,deletionKey);assert.equal(deleted.status,200);assert(!deleted.d.ownerRequests.some(x=>x.id===deletionRequest.id));assert(deleted.d.data.cafes.some(x=>x.id===deletionTenant));assert(deleted.d.data.clients.some(x=>x.id===retainedCard.d.clientId));assert.equal((await act('delete-owner',{requestId:deletionRequest.id},admin,undefined,deletionKey)).status,200);
assert.equal((await req('/api/state?panel=owner',null,null,deletionLogin.cookie)).d.status,'signin');assert.equal((await req('/api/owner-login?panel=owner',null,{username:'delete.test',password:provision.password})).status,401);assert.equal((await req('/api/action?panel=owner',null,{action:'stamp',local:deletionTenant,data:{clientId:retainedCard.d.clientId},key:crypto.randomUUID()},deletionLogin.cookie)).status,401);assert.equal((await req('/api/state?join='+deletionTenant,null,null,retainedCard.cookie)).d.clientId,retainedCard.d.clientId);
let deletionStored=JSON.parse(sql.prepare('select document from estado_aplicacion').get().document);assert(!deletionStored.ownerCredentials.some(x=>x.id===deletionRequest.userId));assert(!deletionStored.ownerSessions.some(x=>x.ownerId===deletionRequest.userId));assert(deleted.d.data.events.some(x=>x.cafe===deletionTenant&&x.text.includes('eliminados')));
for(let status of ['pending','rejected','suspended']){let u={userId:'delete-'+status,email:'delete-'+status+'@example.com'};await act('request-owner',{name:'Solicitud',businessName:status,city:'Mendoza',sector:'otro'},u,undefined,undefined,'?panel=owner');let r=(await req('/api/state?panel=superadmin',admin)).d.ownerRequests.find(x=>x.userId===u.userId);if(status==='rejected')await act('reject-owner',{requestId:r.id});if(status==='suspended'){await act('approve-owner',{requestId:r.id});await act('suspend-owner',{requestId:r.id})}assert.equal((await act('delete-owner',{requestId:r.id})).status,200);assert.equal((await req('/api/state?panel=owner',u)).d.status,'request')}
assert.equal((await act('delete-owner',{requestId:'missing'})).status,404);console.log('PASS: delete requests in all states; admin-only; idempotency; sessions/credentials revoked; businesses, clients and cards retained.');
// Delete a whole business atomically without affecting other businesses.
const eraseInput={...provision,name:'Comercio a eliminar',username:'erase.business'};let eraseCreated=await act('create-business',eraseInput);let eraseRequest=eraseCreated.d.ownerRequests.find(r=>r.email===eraseInput.username),eraseId=eraseRequest.tenantId;let eraseLogin=await req('/api/owner-login?panel=owner',null,{username:eraseInput.username,password:eraseInput.password});assert.equal(eraseLogin.status,200);
let eraseEnrollment=await req('/api/action?join='+eraseId,null,{action:'enroll',local:eraseId,key:crypto.randomUUID(),data:{name:'Fan del comercio',email:'erasefan@example.com',consent:true,enrollmentToken:crypto.randomUUID()+crypto.randomUUID()}});let eraseCard=eraseEnrollment.d.clientId;
const eraseAction=(action,data,local=eraseId)=>req('/api/action?panel=owner',null,{action,local,data,key:crypto.randomUUID()},eraseLogin.cookie);assert.equal((await eraseAction('stamp',{clientId:eraseCard})).status,200);assert.equal((await eraseAction('campaign',{recipientIds:[eraseCard],message:'Mensaje para borrar'})).status,200);
for(let u of [null,owner,other])assert.equal((await act('delete-business',{id:eraseId,confirmName:eraseInput.name},u)).status,403);assert.equal((await eraseAction('delete-business',{id:eraseId,confirmName:eraseInput.name})).status,403);assert.equal((await act('delete-business',{id:eraseId,confirmName:'incorrecto'})).status,400);
let beforeErase=JSON.parse(sql.prepare('select document from estado_aplicacion').get().document),eraseKey=crypto.randomUUID();let erased=await act('delete-business',{id:eraseId,confirmName:eraseInput.name},admin,undefined,eraseKey);assert.equal(erased.status,200);let afterErase=JSON.parse(sql.prepare('select document from estado_aplicacion').get().document);
for(let [field,belongs] of [['cafes',x=>x.id===eraseId],['clients',x=>x.cafe===eraseId],['events',x=>x.cafe===eraseId],['campaigns',x=>x.cafe===eraseId],['ownerRequests',x=>x.tenantId===eraseId],['ownerCredentials',x=>x.id===eraseRequest.userId],['ownerSessions',x=>x.ownerId===eraseRequest.userId]]){assert(!afterErase[field].some(belongs));assert.deepEqual(afterErase[field],beforeErase[field].filter(x=>!belongs(x)))}
assert.equal((await act('delete-business',{id:eraseId,confirmName:eraseInput.name},admin,undefined,eraseKey)).status,200);assert.equal((await req('/api/state?join='+eraseId,null,null,eraseEnrollment.cookie)).status,404);assert.equal((await req('/api/state?panel=owner',null,null,eraseLogin.cookie)).d.status,'signin');assert.equal((await req('/api/owner-login?panel=owner',null,{username:eraseInput.username,password:eraseInput.password})).status,401);assert.equal((await eraseAction('stamp',{clientId:eraseCard})).status,401);assert.equal((await act('delete-business',{id:'missing',confirmName:'missing'})).status,404);
for(let t of afterErase.cafes)assert.equal((await act('delete-business',{id:t.id,confirmName:t.name})).status,200);assert.equal((await req('/api/state?panel=superadmin',admin)).d.data.cafes.length,0);
console.log('PASS: admin-only business deletion, exact-name confirmation, atomic cleanup, session revocation, dead QR/card links, tenant isolation, retries and deleting last business.');
// Several independent owners share one tenant; each new account requires admin approval.
let multi=await act('create-business',{...provision,name:'Varios dueños',username:'multi.first'}),multiId=multi.d.data.cafes[0].id,firstRequest=multi.d.ownerRequests.find(r=>r.tenantId===multiId);let secondInput={tenantId:multiId,name:'Segundo dueño',username:'multi.second',password:'OtraClaveSegura2026!'};
assert.equal((await act('add-owner',secondInput,owner)).status,403);assert.equal((await act('add-owner',secondInput,null)).status,403);assert.equal((await act('add-owner',{...secondInput,tenantId:'missing'})).status,404);assert.equal((await act('add-owner',{...secondInput,password:'short'})).status,400);let addKey=crypto.randomUUID(),added=await act('add-owner',secondInput,admin,undefined,addKey);assert.equal(added.status,200);assert.equal((await act('add-owner',secondInput,admin,undefined,addKey)).status,200);assert.equal((await act('add-owner',secondInput)).status,409);let secondRequest=added.d.ownerRequests.find(r=>r.email===secondInput.username);assert.equal(secondRequest.status,'pending');assert.equal(secondRequest.tenantId,multiId);assert.equal(secondRequest.assignedTenantId,multiId);assert.equal(added.d.data.cafes.length,1);assert(!JSON.stringify(added.d).includes(secondInput.password));assert(!JSON.stringify(added.d).includes('passwordHash'));
const loginMulti=username=>req('/api/owner-login?panel=owner',null,{username,password:username==='multi.first'?provision.password:secondInput.password});assert.equal((await loginMulti('multi.second')).status,401);let firstSession=await loginMulti('multi.first');assert.equal(firstSession.status,200);assert.equal((await act('approve-owner',{requestId:secondRequest.id,tenantId:'wrong-local'})).status,403);assert.equal((await act('approve-owner',{requestId:secondRequest.id},owner)).status,403);assert.equal((await act('approve-owner',{requestId:secondRequest.id})).status,200);let secondSession=await loginMulti('multi.second');assert.equal(secondSession.status,200);assert.equal(secondSession.d.tenantId,multiId);assert.equal(secondSession.d.data.cafes.length,1);assert(secondSession.d.data.cafes[0].owner.includes(provision.owner));assert(secondSession.d.data.cafes[0].owner.includes(secondInput.name));assert.equal((await req('/api/state?panel=owner',null,null,firstSession.cookie)).d.status,'ready');
let sharedFan=await req('/api/action?join='+multiId,null,{action:'enroll',local:multiId,key:crypto.randomUUID(),data:{name:'Fan compartido',email:'sharedfan@example.com',enrollmentToken:crypto.randomUUID()+crypto.randomUUID()}});for(let session of [firstSession,secondSession])assert.equal((await req('/api/action?panel=owner',null,{action:'stamp',local:multiId,key:crypto.randomUUID(),data:{clientId:sharedFan.d.clientId}},session.cookie)).status,200);assert.equal((await req('/api/state?join='+multiId,null,null,sharedFan.cookie)).d.data.clients[0].stamps,2);
await act('suspend-owner',{requestId:secondRequest.id});assert.equal((await req('/api/state?panel=owner',null,null,secondSession.cookie)).d.status,'suspended');let firstStill=await req('/api/state?panel=owner',null,null,firstSession.cookie);assert.equal(firstStill.d.status,'ready');assert.equal(firstStill.d.data.cafes[0].owner,provision.owner);await act('approve-owner',{requestId:secondRequest.id});await act('delete-owner',{requestId:secondRequest.id});assert.equal((await req('/api/state?panel=owner',null,null,firstSession.cookie)).d.status,'ready');assert.equal((await req('/api/state?panel=owner',null,null,secondSession.cookie)).d.status,'signin');
await act('add-owner',{...secondInput,username:'multi.third'});await act('delete-business',{id:multiId,confirmName:'Varios dueños'});let multiDeleted=JSON.parse(sql.prepare('select document from estado_aplicacion').get().document);assert(!multiDeleted.ownerRequests.length);assert(!multiDeleted.ownerCredentials.length);assert(!multiDeleted.ownerSessions.length);console.log('PASS: multiple owners per business, pending login blocked, admin approval locked to original tenant, shared operations, independent suspension/deletion, credentials protected and cascade cleanup.');
// Opening a business from superadmin explicitly asks for that business's credentials.
let loginBusiness=await act('create-business',{...provision,name:'Local para iniciar sesión',username:'local.login'}),loginId=loginBusiness.d.data.cafes[0].id;let targetURL='/api/state?panel=owner&local='+loginId+'&login=1';for(let user of [admin,null,owner]){let page=await req(targetURL,user);assert.equal(page.d.status,'signin');assert.equal(page.d.ownerLoginOnly,true);assert.equal(page.d.loginTenant.id,loginId);assert.equal(page.d.loginTenant.name,'Local para iniciar sesión');assert(!page.d.data);assert(!page.d.ownerRequests)}
let scopedLogin=await req('/api/owner-login?panel=owner',admin,{username:'local.login',password:provision.password,local:loginId});assert.equal(scopedLogin.status,200);assert.equal(scopedLogin.d.tenantId,loginId);assert(scopedLogin.d.user.localLogin);assert(!scopedLogin.d.canonicalURL.includes('login=1'));assert.equal((await req(targetURL,admin,null,scopedLogin.cookie)).d.status,'signin');assert.equal((await req('/api/state'+scopedLogin.d.canonicalURL.slice(1),admin,null,scopedLogin.cookie)).d.status,'ready');
assert.equal((await req('/api/owner-login?panel=owner',admin,{username:'local.login',password:provision.password,local:'wrong-local'})).status,401);assert.equal((await req('/api/state?panel=owner&local=missing&login=1',admin)).status,404);assert.equal((await req('/api/state?panel=superadmin',admin,null,scopedLogin.cookie)).d.status,'ready');console.log('PASS: superadmin business link forces local credential form even with existing session, scopes login to local, removes login flag after success and preserves superadmin session.');

const pushFan = await req('/api/action?join='+loginId, null, {
  action:'enroll', local:loginId, key:crypto.randomUUID(),
  data:{ name:'Fan Push', email:'push@example.test', enrollmentToken:crypto.randomUUID()+crypto.randomUUID() },
});
assert.equal(pushFan.status, 200);
const vapidKeys = await crypto.subtle.generateKey({name:'ECDSA', namedCurve:'P-256'}, true, ['sign', 'verify']);
env.VAPID_PUBLIC_KEY = Buffer.from(await crypto.subtle.exportKey('raw', vapidKeys.publicKey)).toString('base64url');
env.VAPID_PRIVATE_KEY = (await crypto.subtle.exportKey('jwk', vapidKeys.privateKey)).d;
env.VAPID_SUBJECT = 'mailto:push@example.test';
const ownerLoginBody = {username:'local.login', password:provision.password, local:loginId};
const hostedOwnerLogin = await req('/api/owner-login', null, ownerLoginBody);
assert.match(hostedOwnerLogin.setCookie, /; Secure;/);
env.CLUB_DOCKER_PREVIEW = '1';
const lanOwnerLogin = await req('/api/owner-login', null, ownerLoginBody, '', lanOrigin, lanOrigin);
assert.equal(lanOwnerLogin.status, 200, lanOwnerLogin.d.error);
assert.doesNotMatch(lanOwnerLogin.setCookie, /; Secure;/);
assert.equal(lanOwnerLogin.d.pushEnabled, true);
assert.equal((await req('/api/state?panel=owner', null, null, lanOwnerLogin.cookie, lanOrigin, lanOrigin)).d.status, 'ready');
assert.match((await req('/api/owner-login', null, ownerLoginBody)).setCookie, /; Secure;/);
delete env.CLUB_DOCKER_PREVIEW;

const browserKeys = await crypto.subtle.generateKey({name:'ECDH', namedCurve:'P-256'}, true, ['deriveBits']);
const pushBody = { local:loginId, subscription:{
  endpoint:'https://web.push.apple.com/test-device',
  keys:{
    p256dh:Buffer.from(await crypto.subtle.exportKey('raw', browserKeys.publicKey)).toString('base64url'),
    auth:Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url'),
  },
}};
assert.equal((await req('/api/push-subscription', null, pushBody)).status, 401);
const checkPush = cookie => req('/api/push-subscription', null, {...pushBody,check:true}, cookie);
assert.equal((await checkPush()).status, 401);
assert.equal((await checkPush(pushFan.cookie)).d.enabled, false);
assert.equal((await req('/api/push-subscription', null, {
  ...pushBody, subscription:{...pushBody.subscription, endpoint:'https://private.example.test/push'},
}, pushFan.cookie)).status, 400);
assert.equal((await req('/api/push-subscription', null, pushBody, pushFan.cookie)).status, 200);
assert.equal((await checkPush(pushFan.cookie)).d.enabled, true);

const androidPush = {...pushBody, subscription:{...pushBody.subscription, endpoint:'https://fcm.googleapis.com/wp/test-android'}};
assert.equal((await req('/api/push-subscription', null, {...androidPush,check:true}, pushFan.cookie)).d.enabled, false);

const originalFetch = globalThis.fetch;
let pushRequests = 0;
let pushStatus = 201;
globalThis.fetch = async (endpoint, options) => {
  assert.ok([pushBody.subscription.endpoint, androidPush.subscription.endpoint].includes(endpoint));
  assert.equal(options.redirect, 'manual');
  assert.equal(options.headers['content-encoding'], 'aes128gcm');
  assert.ok(options.body.byteLength > 0);
  pushRequests++;
  return new Response(null, {status:pushStatus});
};
try {
  const send = key => req('/api/action?panel=owner', null, {
    action:'campaign', key, local:loginId, data:{recipientIds:[pushFan.d.clientId], message:'Prueba de notificaciones'},
  }, lanOwnerLogin.cookie, lanOrigin, lanOrigin);
  const key = crypto.randomUUID();
  const sent = await send(key);
  assert.equal(sent.status, 200, sent.d.error);
  assert.deepEqual(sent.d.data.campaigns[0].delivery, {status:'complete', accepted:1, failed:0});
  assert.ok(!JSON.stringify(sent.d).includes(pushBody.subscription.endpoint));
  assert.equal((await send(key)).status, 200);
  assert.equal(pushRequests, 1);
  pushStatus = 410;
  assert.deepEqual((await send(crypto.randomUUID())).d.data.campaigns[0].delivery, {status:'complete', accepted:0, failed:1});
  assert.equal((await checkPush(pushFan.cookie)).d.enabled, false);
  assert.equal((await send(crypto.randomUUID())).status, 400);
  assert.equal(pushRequests, 2);
  assert.equal((await req('/api/push-subscription', null, androidPush, pushFan.cookie)).status, 200);
  assert.equal((await req('/api/push-subscription', null, {...androidPush,check:true}, pushFan.cookie)).d.enabled, true);
  pushStatus = 201;
  assert.deepEqual((await send(crypto.randomUUID())).d.data.campaigns[0].delivery, {status:'complete', accepted:1, failed:0});
  assert.equal(pushRequests, 3);
} finally {
  globalThis.fetch = originalFetch;
}

const walletCommerce = await act('create-business',{
  ...provision,name:'Segundo local de la billetera',username:'wallet.owner',
});
const walletId = walletCommerce.d.data.cafes.find(c => c.name === 'Segundo local de la billetera').id;
const walletRoute = '/api/action?join='+walletId;
const walletBody = {
  action:'enroll',local:walletId,key:crypto.randomUUID(),
  data:{walletCommerce:loginId,enrollmentToken:crypto.randomUUID()+crypto.randomUUID()},
};
const previewWallet = await req('/api/state?join='+walletId,null,null,pushFan.cookie);
assert.deepEqual(previewWallet.d.walletProfiles.map(profile=>profile.commerce),[loginId]);
assert.equal(previewWallet.d.clientId,null);
assert.equal((await req(walletRoute,null,walletBody)).status,403);
const joinedWallet = await req(walletRoute,null,walletBody,pushFan.cookie);
assert.equal(joinedWallet.status,200,joinedWallet.d.error);
assert.equal(joinedWallet.d.data.clients[0].email,'push@example.test');
assert.equal(joinedWallet.d.data.clients[0].consent,false);
assert.notEqual(joinedWallet.d.clientId,pushFan.d.clientId);
assert.deepEqual(new Set(joinedWallet.d.wallet.map(entry=>entry.commerce)),new Set([loginId,walletId]));
assert.equal((await req(walletRoute,null,walletBody,pushFan.cookie)).d.clientId,joinedWallet.d.clientId);
const bothCookies = [pushFan.cookie,joinedWallet.cookie].join('; ');
const attemptedDuplicate = {
  ...walletBody,key:crypto.randomUUID(),
  data:{...walletBody.data,enrollmentToken:crypto.randomUUID()+crypto.randomUUID()},
};
assert.equal((await req(walletRoute,null,attemptedDuplicate,bothCookies)).d.clientId,joinedWallet.d.clientId);
assert.equal((await req(walletRoute,null,attemptedDuplicate,pushFan.cookie)).status,409);
const unverifiedMatch = {
  ...attemptedDuplicate,key:crypto.randomUUID(),
  data:{name:'Fan Push',email:'push@example.test',enrollmentToken:crypto.randomUUID()+crypto.randomUUID()},
};
assert.equal((await req(walletRoute,null,unverifiedMatch)).status,409);
assert.deepEqual((await req('/api/state?join='+walletId)).d.wallet,[]);
assert.deepEqual((await req('/api/state?join='+loginId,null,null,joinedWallet.cookie)).d.data.clients,[]);
