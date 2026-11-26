import {createHmac} from 'node:crypto';import {matchTotpStep} from './admin-totp.mjs';import {DatabaseSync} from 'node:sqlite';import assert from 'node:assert/strict';import fs from 'node:fs';import {handleAPI} from './backend.mjs';
const sql=new DatabaseSync(':memory:'),dir=new URL('../drizzle/',import.meta.url);for (const migration of fs.readdirSync(dir).filter(name => name.endsWith('.sql')).sort()) {
  sql.exec(fs.readFileSync(new URL(migration, dir), 'utf8'));
}
const env={SUPERADMIN_EMAILS:JSON.stringify(['admin@example.com','second@example.com']),RATE_LIMIT_SALT:'test'};env.DB={prepare:q=>({bind:(...a)=>({first:async()=>sql.prepare(q).get(...a),run:async()=>({meta:{changes:Number(sql.prepare(q).run(...a).changes)}})})})};
const admin={userId:'a',email:'admin@example.com'},second={userId:'b',email:'second@example.com'},outsider={userId:'x',email:'outsider@example.com'},pw='SecureAdminTest2026!';
async function call(path,{user,body,cookie='',origin='https://club.test',requireTotp=false}={}){let r=await handleAPI(new Request('https://club.test'+path,{method:body?'POST':'GET',headers:{cookie,...(body?{origin,'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}),env,user,requireTotp);return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0],setCookie:r.headers.get('set-cookie')}}
const state=options=>call('/api/state?panel=superadmin',options),setup=(user,password=pw,extra={})=>call('/api/admin-password',{user,body:{password,confirmPassword:password,...extra}}),login=(email,password=pw)=>call('/api/admin-login',{body:{email,password}});
assert.equal((await state()).data.status,'admin-login');let initial=await state({user:admin});assert.equal(initial.data.status,'admin-password');assert(!initial.data.data);assert.equal((await state({user:outsider})).data.status,'forbidden');assert.equal((await setup(outsider)).status,403);assert.equal((await setup(null)).status,403);assert.equal((await setup(admin,'short')).status,400);assert.equal((await setup(admin,pw,{confirmPassword:'different'})).status,400);
const action={action:'toggle-business',data:{id:'central'},key:crypto.randomUUID()};assert.equal((await call('/api/action?panel=superadmin',{user:admin,body:action})).status,403);
let first=await setup(admin);assert.equal(first.status,200);assert.equal(first.data.status,'ready');assert(first.cookie);assert(first.setCookie.includes('HttpOnly'));assert(first.setCookie.includes('Secure'));assert(first.setCookie.includes('SameSite=Lax'));assert(first.data.user.adminLogin);assert(!JSON.stringify(first.data).includes(pw));assert(!JSON.stringify(first.data).includes('passwordHash'));assert(!JSON.stringify(first.data).includes('adminCredentials'));assert.equal((await state({user:admin})).data.status,'admin-login');assert.equal((await state({cookie:first.cookie})).data.status,'ready');assert.equal((await call('/api/action?panel=superadmin',{cookie:first.cookie,body:action})).status,200);assert.equal((await call('/api/action?panel=superadmin',{user:admin,body:{...action,key:crypto.randomUUID()}})).status,403);
assert.equal((await login(admin.email,'bad')).status,401);assert.equal((await login(outsider.email)).status,401);let remote=await login('ADMIN@EXAMPLE.COM');assert.equal(remote.status,200);assert.equal((await state({cookie:remote.cookie})).data.status,'ready');let secondSetup=await setup(second);assert.equal(secondSetup.status,200);assert.equal((await state({cookie:secondSetup.cookie})).data.user.email,second.email);
let resetPage=await call('/api/state?panel=superadmin&password=setup',{user:admin,cookie:secondSetup.cookie});assert.equal(resetPage.data.status,'admin-password');assert.equal(resetPage.data.user.email,admin.email);let next='ChangedAdminTest2026!',reset=await setup(admin,next,{email:second.email});assert.equal(reset.status,200);assert.equal(reset.data.user.email,admin.email);assert.equal((await state({cookie:first.cookie})).data.status,'admin-login');assert.equal((await state({cookie:remote.cookie})).data.status,'admin-login');assert.equal((await state({cookie:secondSetup.cookie})).data.status,'ready');assert.equal((await login(admin.email,pw)).status,401);assert.equal((await login(admin.email,next)).status,200);assert.equal((await login(second.email,pw)).status,200);
let logout=await call('/api/admin-logout',{body:{},cookie:reset.cookie});assert.equal(logout.status,200);assert(logout.setCookie.includes('Max-Age=0'));assert.equal((await state({cookie:reset.cookie,user:admin})).data.status,'admin-login');assert.equal((await state({cookie:'cf_admin=forged'})).data.status,'admin-login');
let live=await login(admin.email,next);let stored=JSON.parse(sql.prepare('select document from estado_aplicacion').get().document);assert(!JSON.stringify(stored).includes(next));assert(!JSON.stringify(stored).includes(pw));assert.notEqual(stored.adminCredentials[0].salt,stored.adminCredentials[1].salt);stored.adminSessions.forEach(x=>x.expires=0);sql.prepare('update app_state set document=?').run(JSON.stringify(stored));assert.equal((await state({cookie:live.cookie})).data.status,'admin-login');
assert.equal((await call('/api/admin-login',{body:{email:admin.email,password:next},origin:'https://evil.test'})).status,403);assert.equal((await call('/api/admin-password',{user:admin,body:{password:next,confirmPassword:next},origin:'https://evil.test'})).status,403);
for(let i=0;i<10;i++)assert.equal((await login('blocked@example.com','bad')).status,401);assert.equal((await login('blocked@example.com','bad')).status,429);
env.SUPERADMIN_EMAILS=JSON.stringify([second.email]);assert.equal((await login(admin.email,next)).status,401);assert.equal((await setup(admin)).status,403);console.log('PASS: verified self-only setup/recovery; password-only remote login; no ChatGPT bypass; protected mutations; independent admin accounts; password hashing; session expiry/revocation/logout; allowlist; CSRF and persisted brute-force limits.');

const totpSecret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
assert.equal(await matchTotpStep(totpSecret, '287082', 59000), 1);
const legacy = await login(second.email,pw);
assert.equal(legacy.status,200);
assert.equal((await state({cookie:legacy.cookie,requireTotp:true})).data.status,'admin-login');
const changePassword = (cookie, currentPassword, password, options={}) => call('/api/admin-change-password',{
  cookie,body:{currentPassword,password,confirmPassword:password,otp:options.otp},
  requireTotp:options.requireTotp,
});
const changedLocal = 'Prueba12';
assert.equal((await changePassword('',pw,changedLocal)).status,401);
assert.equal((await changePassword(legacy.cookie,'incorrecta',changedLocal)).status,403);
for (const invalid of ['A1cdefg', 'abcdefg1', 'Abcdefgh', '12345678']) {
  assert.equal((await changePassword(legacy.cookie,pw,invalid)).status,400);
}

const changed = await changePassword(legacy.cookie,pw,changedLocal);
assert.equal(changed.status,200);
assert.equal(changed.data.status,'admin-login');
assert.equal(changed.data.user,null);
assert.match(changed.setCookie,/Max-Age=0/);
assert.equal((await state({cookie:legacy.cookie})).data.status,'admin-login');
assert.equal((await state({cookie:changed.cookie})).data.status,'admin-login');
assert.equal((await login(second.email,pw)).status,401);
assert.equal((await login(second.email,changedLocal)).data.status,'ready');
const loginPublic = (otp,password=changedLocal) => call('/api/admin-login',{body:{email:second.email,password,otp},requireTotp:true});
const recoverPublic = (otp,recoveryKey,password=pw) => call('/api/admin-password',{
  user:second,body:{password,confirmPassword:password,otp,recoveryKey},requireTotp:true,
});
assert.equal((await loginPublic('123456')).status,401);
env.SUPERADMIN_TOTP_SECRETS = JSON.stringify({[second.email]:totpSecret});
env.SUPERADMIN_RECOVERY_KEY = 'fake-recovery-key-only-for-tests-2026';
const originalNow=Date.now;
const time=originalNow();
const codeAt = millis => {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(millis/30000)));
  const digest=createHmac('sha1','12345678901234567890').update(counter).digest();
  return ((digest.readUInt32BE(digest[19]&15)&0x7fffffff)%1000000).toString().padStart(6,'0');
};
try {
  Date.now=()=>time;
  assert.equal((await loginPublic(undefined)).status,401);
  assert.equal((await recoverPublic(codeAt(time))).status,403);
  const publicLogin=await loginPublic(codeAt(time));
  assert.equal(publicLogin.status,200);
  assert.equal((await state({cookie:publicLogin.cookie,requireTotp:true})).data.status,'ready');
  assert.equal((await loginPublic(codeAt(time))).status,401);
  assert.equal((await recoverPublic(codeAt(time),env.SUPERADMIN_RECOVERY_KEY)).status,403);
  Date.now=()=>time+30000;
  const recovered=await recoverPublic(codeAt(Date.now()),env.SUPERADMIN_RECOVERY_KEY,'Rotated test admin password 2');
  assert.equal(recovered.status,200);
  assert.equal((await state({cookie:publicLogin.cookie,requireTotp:true})).data.status,'admin-login');
  assert.equal((await state({cookie:recovered.cookie,requireTotp:true})).data.status,'ready');
  assert.equal((await changePassword(recovered.cookie,'Rotated test admin password 2',changedLocal,{requireTotp:true})).status,403);
  Date.now=()=>time+60000;
  const changedPublic=await changePassword(recovered.cookie,'Rotated test admin password 2',changedLocal,{
    requireTotp:true,otp:codeAt(Date.now()),
  });
  assert.equal(changedPublic.status,200);
  assert.equal(changedPublic.data.status,'admin-login');
  assert.equal(changedPublic.data.adminTotpRequired,true);
  assert.match(changedPublic.setCookie,/Max-Age=0/);
  assert.equal((await state({cookie:recovered.cookie,requireTotp:true})).data.status,'admin-login');
  Date.now=()=>time+90000;
  const reauthenticated=await loginPublic(codeAt(Date.now()));
  assert.equal(reauthenticated.data.status,'ready');
  env.SUPERADMIN_TOTP_SECRETS='{}';
  assert.equal((await state({cookie:reauthenticated.cookie,requireTotp:true})).data.status,'admin-login');
} finally {
  Date.now=originalNow;
}
