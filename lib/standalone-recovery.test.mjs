import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import test from 'node:test';
import { handleAPI } from './backend.mjs';

const sql = new DatabaseSync(':memory:');
const migrations = new URL('../drizzle/', import.meta.url);
for (const migration of fs.readdirSync(migrations).filter(name => name.endsWith('.sql')).sort()) {
  sql.exec(fs.readFileSync(new URL(migration, migrations), 'utf8'));
}

const email = 'admin@example.test';
const totpSecret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const recoveryKey = 'test-only-recovery-key-long-enough-2026';
const host = 'https://clubdefans.ar';
const env = {
  CLUB_STANDALONE: '1',
  SUPERADMIN_EMAILS: JSON.stringify([email]),
  SUPERADMIN_TOTP_SECRETS: JSON.stringify({[email]:totpSecret}),
  SUPERADMIN_RECOVERY_KEY: recoveryKey,
  RATE_LIMIT_SALT: 'test',
  DB: {
    prepare(query) {
      return {
        bind(...values) {
          return {
            first: async () => sql.prepare(query).get(...values),
            run: async () => ({meta:{changes:Number(sql.prepare(query).run(...values).changes)}}),
          };
        },
      };
    },
  },
};

async function call(path, body, options = {}) {
  const response = await handleAPI(new Request(host + path, {
    method: body ? 'POST' : 'GET',
    headers: body ? {origin:host,'content-type':'application/json'} : {},
    body: body ? JSON.stringify(body) : undefined,
  }), env, undefined, options.requireTotp ?? true);
  return {
    status:response.status,
    data:await response.json(),
    cookie:response.headers.get('set-cookie')?.split(';')[0],
  };
}

function codeAt(millis) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(millis / 30000)));
  const digest = createHmac('sha1', '12345678901234567890').update(counter).digest();
  return ((digest.readUInt32BE(digest[19] & 15) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
}

test('standalone superadmin setup uses the allowlist, recovery key and one-time TOTP without Access', async () => {
  const setupPage = await call('/api/state?panel=superadmin&password=setup');
  assert.equal(setupPage.data.status, 'admin-password');
  assert.equal(setupPage.data.setupNeedsEmail, true);
  assert.equal(setupPage.data.adminTotpRequired, true);
  assert.equal(setupPage.data.user.email, '');
  assert.equal((await call('/api/state?panel=superadmin')).data.status, 'admin-login');

  const password = 'SecureStandalone2026!';
  const setup = body => call('/api/admin-password?panel=superadmin&password=setup', body);
  const originalNow = Date.now;
  const time = originalNow();
  try {
    Date.now = () => time;
    const credentials = {
      email,
      password,
      confirmPassword:password,
      otp:codeAt(time),
      recoveryKey,
    };
    assert.equal((await setup({...credentials,email:'other@example.test'})).status, 403);
    assert.equal((await setup({...credentials,recoveryKey:'wrong recovery key'})).status, 403);
    assert.equal((await setup({...credentials,otp:'000000'})).status, 403);
    const created = await setup(credentials);
    assert.equal(created.status, 200);
    assert.equal(created.data.status, 'ready');
    assert(created.cookie);
    assert.equal((await call('/api/state?panel=superadmin', undefined)).data.status, 'admin-login');

    Date.now = () => time + 30000;
    const login = await call('/api/admin-login', {email,password,otp:codeAt(Date.now())});
    assert.equal(login.status, 200);
    assert.equal(login.data.status, 'ready');
    assert.equal((await handleAPI(new Request(host + '/api/state?panel=superadmin', {
      headers:{cookie:login.cookie},
    }), env, undefined, true)).status, 200);
  } finally {
    Date.now = originalNow;
  }
});
