import assert from 'node:assert/strict';
import test from 'node:test';
import { standaloneRequest } from '../worker/standalone-auth.mjs';

const host = 'https://clubdefans.ar';
const audience = 'audience';
const access = { aud: audience, getIdentity: async () => ({ email: 'Admin@Example.test' }) };
const spoofed = { 'oai-authenticated-user-id': 'spoofed', 'oai-authenticated-user-email': 'other@example.test' };

test('the standalone Worker strips identity headers on public and ordinary API routes', async () => {
  for (const path of ['/?join=central', '/api/state?panel=superadmin', '/api/admin-password']) {
    const request = new Request(host + path, { headers: spoofed });
    const result = await standaloneRequest(request, access, audience);
    assert.equal(result.url, request.url);
    assert.equal(result.headers.get('oai-authenticated-user-id'), null);
    assert.equal(result.headers.get('oai-authenticated-user-email'), null);
  }
});

test('setup requires the configured Cloudflare Access application', async () => {
  const request = new Request(host + '/admin/setup/api', { headers: spoofed });
  for (const identity of [undefined, { ...access, aud: 'other' }]) {
    assert.equal((await standaloneRequest(request, identity, audience)).status, 403);
  }
  assert.equal((await standaloneRequest(request, access, undefined)).status, 403);
  assert.equal((await standaloneRequest(request, access, audience)).headers.get('oai-authenticated-user-email'),
    'admin@example.test');
});

test('verified recovery preserves the POST body and maps to the existing password handler', async () => {
  const input = JSON.stringify({ password: 'TestOnly123', otp: '123456' });
  const request = new Request(host + '/admin/setup/api', {
    method: 'POST',
    headers: { ...spoofed, 'content-type': 'application/json', origin: host },
    body: input,
  });
  const result = await standaloneRequest(request, access, audience);
  assert.equal(result.url, host + '/api/admin-password?panel=superadmin&password=setup');
  assert.equal(result.method, 'POST');
  assert.equal(result.headers.get('origin'), host);
  assert.equal(result.headers.get('oai-authenticated-user-id'), 'access:admin@example.test');
  assert.equal(await result.text(), input);
});
