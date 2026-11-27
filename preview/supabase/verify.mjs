import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { demoState } from './demo-state.mjs';

const {
  SUPABASE_URL: endpoint,
  SUPABASE_PUBLISHABLE_KEY: publicKey,
  SUPABASE_ADMIN_KEY: adminKey,
  SUPABASE_DEMO_PASSWORDS: hostedPasswords,
} = process.env;
const url = new URL(endpoint);
const hosted = process.argv.includes('--hosted');
if (hosted) {
  assert.match(url.origin, /^https:\/\/[a-z0-9]+\.supabase\.co$/);
} else {
  assert.equal(url.origin, 'http://127.0.0.1:54321');
}
assert.equal(url.href, url.origin + '/');
assert.ok(publicKey && adminKey && publicKey !== adminKey, 'Faltan las claves de Supabase de prueba');

const roles = ['cliente', 'dueno', 'superadmin'];
const file = new URL('./.env.demo.json', import.meta.url);
const passwords = hosted
  ? JSON.parse(hostedPasswords)
  : JSON.parse(await readFile(file, 'utf8').catch(async (error) => {
      if (error.code !== 'ENOENT') throw error;
      const generated = JSON.stringify(Object.fromEntries(roles.map(role => [
        role, randomBytes(24).toString('base64url'),
      ])), null, 2);
      await writeFile(file, generated, { flag: 'wx' });
      return generated;
    }));
assert.ok(roles.every(role => typeof passwords[role] === 'string' && passwords[role].length >= 16));
assert.equal(new Set(roles.map(role => passwords[role])).size, roles.length);

async function request(path, { key = adminKey, token, method = 'GET', body, prefer } = {}) {
  const headers = { apikey: key };
  const bearer = token ?? (key.split('.').length === 3 ? key : undefined);
  if (bearer) headers.Authorization = 'Bearer ' + bearer;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  const result = await fetch(new URL(path, url), {
    method, headers, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000),
  });
  const content = await result.text();
  const response = content ? JSON.parse(content) : null;
  return { ok: result.ok, status: result.status, response };
}

function success(result, action) {
  assert.ok(result.ok, `${action}: HTTP ${result.status} (${result.response?.code ?? 'sin código'})`);
  return result.response;
}

async function upsert(table, body) {
  success(await request('/rest/v1/' + table, {
    method: 'POST', body, prefer: 'resolution=merge-duplicates,return=minimal',
  }), 'Preparar ' + table);
}

const users = {};
for (const role of roles) {
  const email = `${role}@demo.clubdefans.test`;
  const password = passwords[role];
  const signIn = () => request('/auth/v1/token?grant_type=password', {
    key: publicKey, method: 'POST', body: { email, password },
  });
  let login = await signIn();
  if (!login.ok && login.response?.error_code === 'invalid_credentials') {
    success(await request('/auth/v1/admin/users', {
      method: 'POST', body: { email, password, email_confirm: true },
    }), 'Crear ' + role);
    login = await signIn();
  }
  const session = success(login, 'Iniciar sesión como ' + role);
  users[role] = { id: session.user.id, email: session.user.email, token: session.access_token };
}

await upsert('perfiles', roles.map(rol => ({ rol, usuario_id: users[rol].id })));
await upsert('comercios', [
  { id: 'cafe-norte', nombre: 'Café Norte' },
  { id: 'cafe-sur', nombre: 'Café Sur' },
]);
await upsert('duenos_comercio', { usuario_id: users.dueno.id, comercio_id: 'cafe-norte' });
await upsert('clientes', [
  { id: 'cliente-norte', usuario_id: users.cliente.id, comercio_id: 'cafe-norte', nombre: 'Cliente demo' },
  { id: 'otro-norte', usuario_id: null, comercio_id: 'cafe-norte', nombre: 'Otro cliente de Norte' },
  { id: 'cliente-sur', usuario_id: null, comercio_id: 'cafe-sur', nombre: 'Cliente de Sur' },
]);
await upsert('tarjetas', ['cliente-norte', 'otro-norte', 'cliente-sur'].map(id => ({
  id, cliente_id: id, objetivo: 5,
})));
await upsert('premios', [
  { id: 'premio-norte', comercio_id: 'cafe-norte', descripcion: 'Café gratis', sellos_requeridos: 5 },
  { id: 'premio-sur', comercio_id: 'cafe-sur', descripcion: 'Medialuna', sellos_requeridos: 3 },
]);
success(await request('/rest/v1/club_preview_state', {
  method: 'POST', body: { id: 'demo', document: demoState(users) },
  prefer: 'resolution=ignore-duplicates,return=minimal',
}), 'Inicializar los paneles originales');

const as = (role, table, options = {}) => request('/rest/v1/' + table, {
  key: publicKey, token: users[role].token, ...options,
});
const expected = {
  cliente: ['cliente-norte'],
  dueno: ['cliente-norte', 'otro-norte'],
  superadmin: ['cliente-norte', 'cliente-sur', 'otro-norte'],
};
for (const role of roles) {
  const cards = success(await as(role, 'tarjetas?select=id&order=id'), 'Leer tarjetas como ' + role);
  assert.deepEqual(cards.map(card => card.id), expected[role]);
  const stores = success(await as(role, 'comercios?select=id&order=id'), 'Leer comercios como ' + role);
  assert.deepEqual(stores.map(store => store.id), role === 'superadmin' ? ['cafe-norte', 'cafe-sur'] : ['cafe-norte']);
  const prizes = success(await as(role, 'premios?select=id&order=id'), 'Leer premios como ' + role);
  assert.deepEqual(prizes.map(prize => prize.id), role === 'superadmin' ? ['premio-norte', 'premio-sur'] : ['premio-norte']);
}

const stamp = (role, tarjeta_id) => as(role, 'sellos?select=id,tarjeta_id', {
  method: 'POST', body: { tarjeta_id }, prefer: 'return=representation',
});
for (const [role, card] of [['cliente', 'cliente-norte'], ['dueno', 'cliente-sur']]) {
  const denied = await stamp(role, card);
  assert.equal(denied.response?.code, '42501', `Sello bloqueado para ${role}`);
}
const escalation = await as('cliente', `perfiles?usuario_id=eq.${users.cliente.id}`, {
  method: 'PATCH', body: { rol: 'superadmin' },
});
assert.equal(escalation.response?.code, '42501');
assert.equal((await request('/rest/v1/tarjetas', { key: publicKey })).ok, false);
for (const role of roles) {
  assert.equal((await as(role, 'club_preview_state?select=document')).ok, false);
}

for (const [role, card] of [['dueno', 'cliente-norte'], ['superadmin', 'cliente-sur']]) {
  const [created] = success(await stamp(role, card), 'Agregar sello como ' + role);
  try {
    assert.equal(created.tarjeta_id, card);
    const stamps = success(await as('cliente', 'sellos?select=id,tarjeta_id'), 'Leer sellos del cliente');
    assert.equal(stamps.some(row => row.id === created.id), role === 'dueno');
    assert.ok(stamps.every(row => row.tarjeta_id === 'cliente-norte'));
  } finally {
    success(await request('/rest/v1/sellos?id=eq.' + created.id, { method: 'DELETE' }), 'Limpiar sello de prueba');
  }
}
console.log('Verificados: login, tres perfiles, aislamiento por comercio y permisos de sellos.');
