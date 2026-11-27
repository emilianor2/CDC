import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Script } from 'node:vm';
import { setTimeout as delay } from 'node:timers/promises';
import { generateKeyPairSync, randomBytes } from 'node:crypto';

const base = process.env.PREVIEW_BASE_URL || 'http://127.0.0.1:8787';
const checkFixtures = process.env.CHECK_DEMO_MUTATION === 'true';
const passwords = JSON.parse(process.env.SUPABASE_DEMO_PASSWORDS
  || await readFile(new URL('./.env.demo.json', import.meta.url), 'utf8'));
const accounts = [
  ['cliente', '/?join=cafe-norte', 'function customerCardPage', ['cafe-norte'], ['cliente-norte']],
  ['dueno', '/?panel=owner', 'Programa de fidelidad', ['cafe-norte'], ['cliente-norte', 'otro-norte']],
  ['superadmin', '/?panel=superadmin', 'Resumen global', ['cafe-norte', 'cafe-sur'], ['cliente-norte', 'otro-norte', 'cliente-sur']],
];

function request(path, options = {}) {
  return fetch(new URL(path, base), { redirect: 'manual', signal: AbortSignal.timeout(15_000), ...options });
}

async function checkLoginPage() {
  for (let attempt = 0; attempt < 15; attempt++) {
    const page = await request('/').catch(() => null);
    if (page?.ok && page.headers.get('referrer-policy') === 'same-origin') {
      const html = await page.text();
      if (html.includes('action="/login"') && html.includes('rel="manifest"')) return;
    }
    await delay(2000);
  }
  assert.fail('La versión esperada del formulario todavía no se sirve en Cloudflare.');
}
await checkLoginPage();
const manifest = await request('/club.webmanifest');
assert.equal(manifest.status, 200);
assert.equal((await manifest.json()).display, 'standalone');
assert.equal((await request('/api/state?panel=superadmin', { headers: {
  'oai-authenticated-user-email': 'superadmin@demo.clubdefans.test',
} })).status, 401);
assert.equal((await request('/app.html')).status, 404);

const sessions = {};
const visibleStores = {};
for (const [role, destination, marker, stores, clients] of accounts) {
  const credentials = new URLSearchParams({ email: role + '@demo.clubdefans.test', password: passwords[role] });
  const login = await request('/login', { method: 'POST', headers: { Origin: base }, body: credentials });
  assert.equal(login.status, 303);
  assert.equal(login.headers.get('location'), destination, 'Destino para ' + role);
  const setCookie = login.headers.get('set-cookie');
  assert.ok(/HttpOnly.*SameSite=Lax/.test(setCookie), 'La cookie de sesión debe ser HttpOnly y SameSite=Lax');
  if (base.startsWith('https:')) assert.ok(/; Secure(?:;|$)/.test(setCookie), 'La cookie de sesión debe requerir HTTPS');
  const Cookie = setCookie.split(';')[0];
  const view = await request(destination, { headers: { Cookie } });
  assert.equal(view.status, 200);
  assert.equal(view.headers.get('referrer-policy'), 'same-origin');
  const html = await view.text();
  assert.doesNotMatch(html, /<meta name="referrer" content="no-referrer">/);
  assert.match(html, new RegExp(marker));
  const script = html.match(/<script>([\s\S]+)<\/script>/);
  assert.ok(script);
  new Script(script[1]);

  const query = destination.slice(1);
  const state = await request('/api/state' + query, { headers: { Cookie } });
  assert.equal(state.status, 200);
  const account = await state.json();
  assert.equal(account.status, 'ready');
  if (role === 'cliente') assert.match(account.pushPublicKey, /^B[A-Za-z0-9_-]{86}$/);
  if (role === 'dueno') assert.equal(account.pushEnabled, true);
  visibleStores[role] = account.data.cafes.map(store => store.id).sort();
  if (checkFixtures) {
    assert.deepEqual(visibleStores[role], [...stores].sort());
    assert.deepEqual(account.data.clients.map(client => client.id).sort(), [...clients].sort());
  } else if (role === 'cliente') {
    assert.ok(account.data.clients.length <= 1);
    assert.ok(account.data.clients.every(client => client.email === 'cliente@demo.clubdefans.test'));
  } else if (role === 'dueno') {
    assert.deepEqual(visibleStores[role], ['cafe-norte']);
    assert.ok(account.data.clients.every(client => client.cafe === 'cafe-norte'));
  }
  assert.ok(account.data.clients.every(client => !Object.hasOwn(client, 'tokenHash')));
  sessions[role] = Cookie;
}

const change = (role, path, action, local, data, key = randomUUID()) => request('/api/action' + path, {
  method: 'POST', headers: { Cookie: sessions[role], Origin: base, 'Content-Type': 'application/json' },
  body: JSON.stringify({ action, local, data, key }),
});
assert.equal((await request('/api/state?panel=superadmin', { headers: { Cookie: sessions.dueno } })).status, 403);
assert.equal((await request('/api/state?panel=owner&local=cafe-sur', { headers: { Cookie: sessions.dueno } })).status, 403);
assert.equal((await change('dueno', '?panel=owner', 'stamp', 'cafe-sur', { clientId: 'cliente-sur' })).status, 403);
assert.equal((await change('cliente', '?join=cafe-norte', 'stamp', 'cafe-norte', { clientId: 'cliente-norte' })).status, 403);
if (visibleStores.superadmin.includes('cafe-sur')) {
  const delegated = await request('/api/state?panel=owner&local=cafe-sur', { headers: { Cookie: sessions.superadmin } });
  assert.equal(delegated.status, 200);
  assert.equal((await delegated.json()).readOnly, true);
}
if (checkFixtures) {
  const { x, y } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey.export({ format: 'jwk' });
  const subscription = {
    endpoint: 'https://web.push.apple.com/ci-test',
    keys: {
      p256dh: Buffer.concat([Buffer.from([4]), Buffer.from(x, 'base64url'), Buffer.from(y, 'base64url')]).toString('base64url'),
      auth: randomBytes(16).toString('base64url'),
    },
  };
  const subscriptionRequest = (role, local, check) => request('/api/push-subscription', {
    method: 'POST', headers: { Cookie: sessions[role], Origin: base, 'Content-Type': 'application/json' },
    body: JSON.stringify({ local, subscription, check }),
  });
  assert.equal((await subscriptionRequest('dueno', 'cafe-norte', false)).status, 403);
  assert.equal((await subscriptionRequest('cliente', 'cafe-sur', false)).status, 403);
  assert.equal((await subscriptionRequest('cliente', 'cafe-norte', false)).status, 200);
  assert.equal((await (await subscriptionRequest('cliente', 'cafe-norte', true)).json()).enabled, true);
  const owner = await request('/api/state?panel=owner', { headers: { Cookie: sessions.dueno } });
  assert.equal((await owner.json()).data.clients.find(client => client.id === 'cliente-norte').pushReady, true);

  const before = await request('/api/state?join=cafe-norte', { headers: { Cookie: sessions.cliente } });
  const original = (await before.json()).data.clients[0].stamps;
  const key = randomUUID();
  for (let i = 0; i < 2; i++) {
    const stamp = await change('dueno', '?panel=owner', 'stamp', 'cafe-norte', { clientId: 'cliente-norte' }, key);
    assert.equal(stamp.status, 200);
    assert.equal((await stamp.json()).data.clients.find(client => client.id === 'cliente-norte').stamps, original + 1);
  }
  const customer = await request('/api/state?join=cafe-norte', { headers: { Cookie: sessions.cliente } });
  assert.equal((await customer.json()).data.clients[0].stamps, original + 1);
  assert.equal((await change('dueno', '?panel=owner', 'unstamp', 'cafe-norte', { clientId: 'cliente-norte' })).status, 200);
}
const logout = await request('/logout', { method: 'POST', headers: { Cookie: sessions.superadmin, Origin: base } });
assert.equal(logout.status, 303);
assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
console.log('Verificados los tres formularios de acceso, paneles originales y permisos por comercio.');
